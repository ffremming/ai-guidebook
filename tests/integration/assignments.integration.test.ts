import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 3211;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess: ChildProcessWithoutNullStreams | null = null;

function addCookiesFromResponse(
  response: Response,
  cookieJar: Map<string, string>,
): void {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    const [pair] = cookie.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    cookieJar.set(key, value);
  }
}

function serializeCookies(cookieJar: Map<string, string>): string {
  return Array.from(cookieJar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

async function waitForServerReady(): Promise<void> {
  const timeoutAt = Date.now() + 90_000;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(`${BASE_URL}/api/auth/providers`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not yet reachable.
    }

    await delay(500);
  }

  throw new Error('Timed out waiting for Next.js server startup');
}

async function signInAsCredentials(
  cookieJar: Map<string, string>,
  email: string,
  name: string,
): Promise<void> {
  const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`);
  assert.equal(csrfResponse.status, 200);
  addCookiesFromResponse(csrfResponse, cookieJar);

  const csrfPayload = (await csrfResponse.json()) as { csrfToken: string };
  assert.ok(csrfPayload.csrfToken);

  const signInBody = new URLSearchParams({
    csrfToken: csrfPayload.csrfToken,
    email,
    name,
    callbackUrl: `${BASE_URL}/dashboard`,
    json: 'true',
  });

  const signInResponse = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: serializeCookies(cookieJar),
    },
    body: signInBody.toString(),
    redirect: 'manual',
  });

  assert.ok(signInResponse.status === 200 || signInResponse.status === 302);
  addCookiesFromResponse(signInResponse, cookieJar);
}

before(async () => {
  const seedProcess = spawn('npm', ['run', 'db:seed'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  const seedExitCode: number = await new Promise((resolve, reject) => {
    seedProcess.on('error', reject);
    seedProcess.on('close', (code) => resolve(code ?? 1));
  });

  if (seedExitCode !== 0) {
    throw new Error(`db:seed failed with exit code ${seedExitCode}`);
  }

  serverProcess = spawn('npm', ['run', 'start', '--', '--port', String(PORT)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  await waitForServerReady();
});

after(async () => {
  if (!serverProcess) {
    return;
  }

  serverProcess.kill('SIGTERM');
  await delay(500);

  if (!serverProcess.killed) {
    serverProcess.kill('SIGKILL');
  }
});

describe('GET /api/assignments', () => {
  test('returns only student-enrolled assignments and supports course filter', async () => {
    const cookieJar = new Map<string, string>();

    await signInAsCredentials(cookieJar, 'student@ntnu.no', 'Student User');

    const assignmentsResponse = await fetch(`${BASE_URL}/api/assignments`, {
      headers: {
        cookie: serializeCookies(cookieJar),
      },
    });
    assert.equal(assignmentsResponse.status, 200);

    const assignmentsPayload = (await assignmentsResponse.json()) as {
      assignments: Array<{ id: string; courseId: string; title: string }>;
    };

    assert.equal(assignmentsPayload.assignments.length, 4);

    const targetCourseId = assignmentsPayload.assignments[0]?.courseId;
    assert.ok(targetCourseId);

    const filteredResponse = await fetch(
      `${BASE_URL}/api/assignments?courseId=${encodeURIComponent(targetCourseId)}`,
      {
        headers: {
          cookie: serializeCookies(cookieJar),
        },
      },
    );
    assert.equal(filteredResponse.status, 200);

    const filteredPayload = (await filteredResponse.json()) as {
      assignments: Array<{ courseId: string }>;
    };

    assert.ok(filteredPayload.assignments.length > 0);
    assert.ok(filteredPayload.assignments.every((assignment) => assignment.courseId === targetCourseId));
  });

  test('supports adding assignment access by assignment code for a new student user', async () => {
    const cookieJar = new Map<string, string>();
    await signInAsCredentials(cookieJar, 'newstudent@ntnu.no', 'New Student');

    const beforeResponse = await fetch(`${BASE_URL}/api/assignments`, {
      headers: {
        cookie: serializeCookies(cookieJar),
      },
    });
    assert.equal(beforeResponse.status, 200);

    const beforePayload = (await beforeResponse.json()) as {
      assignments: Array<{ id: string }>;
    };
    assert.equal(beforePayload.assignments.length, 0);

    const joinResponse = await fetch(`${BASE_URL}/api/assignments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(cookieJar),
      },
      body: JSON.stringify({
        assignmentCode: 'TDT4290-PROPOSAL',
      }),
    });
    assert.equal(joinResponse.status, 200);

    const joinPayload = (await joinResponse.json()) as {
      assignment: { assignmentCode: string; title: string };
    };
    assert.equal(joinPayload.assignment.assignmentCode, 'TDT4290-PROPOSAL');
    assert.equal(joinPayload.assignment.title, 'Project Proposal');

    const afterResponse = await fetch(`${BASE_URL}/api/assignments`, {
      headers: {
        cookie: serializeCookies(cookieJar),
      },
    });
    assert.equal(afterResponse.status, 200);

    const afterPayload = (await afterResponse.json()) as {
      assignments: Array<{ assignmentCode: string }>;
    };
    assert.ok(afterPayload.assignments.length >= 1);
    assert.ok(
      afterPayload.assignments.some(
        (assignment) => assignment.assignmentCode === 'TDT4290-PROPOSAL',
      ),
    );
  });
});
