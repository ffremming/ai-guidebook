import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { prisma } from '../../src/lib/db/client';

const PORT = 3213;
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
      // Not ready yet.
    }

    await delay(500);
  }

  throw new Error('Timed out waiting for server startup');
}

async function login(email: string, name: string): Promise<Map<string, string>> {
  const cookieJar = new Map<string, string>();
  const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`);
  assert.equal(csrfResponse.status, 200);
  addCookiesFromResponse(csrfResponse, cookieJar);

  const csrfPayload = (await csrfResponse.json()) as { csrfToken: string };
  assert.ok(csrfPayload.csrfToken);

  const body = new URLSearchParams({
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
    body: body.toString(),
    redirect: 'manual',
  });

  assert.ok(signInResponse.status === 200 || signInResponse.status === 302);
  addCookiesFromResponse(signInResponse, cookieJar);

  return cookieJar;
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

describe('POST + GET /api/logs', () => {
  beforeEach(async () => {
    const student = await prisma.user.findUnique({
      where: { email: 'student@ntnu.no' },
      select: { id: true },
    });
    assert.ok(student?.id);

    await prisma.aiLog.deleteMany({
      where: { userId: student.id },
    });
  });

  test('stores encrypted data and returns decrypted values', async () => {
    const cookies = await login('student@ntnu.no', 'Student User');

    const assignment = await prisma.assignment.findFirst({
      where: {
        course: {
          enrollments: {
            some: {
              user: { email: 'student@ntnu.no' },
              role: 'STUDENT',
            },
          },
        },
      },
      select: { id: true },
    });
    assert.ok(assignment?.id);

    const payload = {
      assignmentId: assignment.id,
      usageSubsections: ['critique-and-quality-improvement', 'debugging-support'],
      usageReason: 'I used AI to get grammar feedback and improve wording clarity.',
      sessionDescription: 'Asked for sentence-level edits and short explanations.',
      aiTool: 'ChatGPT',
      usageEvidence: [
        {
          nodeId: 'critique-and-quality-improvement',
          text: 'https://chat.openai.com/c/abc',
        },
        {
          nodeId: 'debugging-support',
          text: 'Used for error analysis only, not direct code replacement.',
        },
      ],
    };

    const postResponse = await fetch(`${BASE_URL}/api/logs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(cookies),
      },
      body: JSON.stringify(payload),
    });
    assert.equal(postResponse.status, 201);

    const created = (await postResponse.json()) as { id: string };
    assert.ok(created.id);

    const stored = await prisma.aiLog.findUnique({
      where: { id: created.id },
      include: {
        conversationLinks: {
          orderBy: [{ createdAt: 'asc' }],
        },
      },
    });
    assert.ok(stored);
    assert.notEqual(stored.usageReason, payload.usageReason);
    assert.notEqual(stored.sessionDescription, payload.sessionDescription);
    assert.equal(stored.manualUsageSection, 'writing');
    assert.equal(stored.manualUsageSubsection, payload.usageSubsections[0]);
    assert.deepEqual(stored.manualUsageSubsections, payload.usageSubsections);
    assert.equal(stored.conversationLinks.length, 2);
    assert.equal(stored.conversationLinks[0]?.url, null);
    assert.equal(stored.conversationLinks[0]?.usageNodeId, payload.usageEvidence[0]?.nodeId);
    assert.equal(stored.conversationLinks[1]?.evidenceType, null);
    assert.notEqual(stored.conversationLinks[1]?.comment, payload.usageEvidence[1]?.text);

    const getResponse = await fetch(`${BASE_URL}/api/logs/${created.id}`, {
      headers: {
        cookie: serializeCookies(cookies),
      },
    });
    assert.equal(getResponse.status, 200);

    const fetched = (await getResponse.json()) as {
      usageSection: string;
      usageSections: string[];
      usageSubsection: string;
      usageSubsections: string[];
      usageReason: string;
      sessionDescription: string | null;
      conversationLinks: Array<{
        usageNodeId: string | null;
        evidenceType: string | null;
        text: string | null;
      }>;
    };

    assert.equal(fetched.usageSection, 'writing');
    assert.deepEqual(fetched.usageSections, ['writing', 'programming']);
    assert.equal(fetched.usageSubsection, payload.usageSubsections[0]);
    assert.deepEqual(fetched.usageSubsections, payload.usageSubsections);
    assert.equal(fetched.usageReason, payload.usageReason);
    assert.equal(fetched.sessionDescription, payload.sessionDescription);
    assert.equal(fetched.conversationLinks.length, 2);
    assert.equal(fetched.conversationLinks[0]?.text, payload.usageEvidence[0]?.text);
    assert.equal(
      fetched.conversationLinks[0]?.usageNodeId,
      payload.usageEvidence[0]?.nodeId,
    );
    assert.equal(fetched.conversationLinks[1]?.text, payload.usageEvidence[1]?.text);
  });

  test('rejects subsection that does not belong to selected section', async () => {
    const cookies = await login('student@ntnu.no', 'Student User');

    const assignment = await prisma.assignment.findFirst({
      where: {
        course: {
          enrollments: {
            some: {
              user: { email: 'student@ntnu.no' },
              role: 'STUDENT',
            },
          },
        },
      },
      select: { id: true },
    });
    assert.ok(assignment?.id);

    const response = await fetch(`${BASE_URL}/api/logs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(cookies),
      },
      body: JSON.stringify({
        assignmentId: assignment.id,
        usageSubsections: ['not-a-real-node'],
        usageReason: 'I used AI to improve my text quality through specific suggestions.',
        sessionDescription: 'Asked for line-by-line feedback.',
        aiTool: 'ChatGPT',
        usageEvidence: [],
      }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as {
      error: string;
      fields?: Record<string, string[]>;
    };
    assert.equal(payload.error, 'Validation failed');
    assert.ok(payload.fields?.usageSubsections?.[0]?.includes('valid nodes'));
  });

  test('allows owner to edit log with the same fields as new log', async () => {
    const cookies = await login('student@ntnu.no', 'Student User');

    const assignments = await prisma.assignment.findMany({
      where: {
        course: {
          enrollments: {
            some: {
              user: { email: 'student@ntnu.no' },
              role: 'STUDENT',
            },
          },
        },
      },
      select: { id: true },
      take: 2,
    });
    assert.ok(assignments.length >= 2);

    const createResponse = await fetch(`${BASE_URL}/api/logs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(cookies),
      },
      body: JSON.stringify({
        assignmentId: assignments[0]?.id,
        usageSubsections: ['debugging-support'],
        usageReason: 'Initial reason for creating this log entry.',
        sessionDescription: 'Initial details',
        aiTool: 'ChatGPT',
        usageEvidence: [
          {
            nodeId: 'debugging-support',
            text: 'Initial evidence text',
          },
        ],
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { id: string };
    assert.ok(created.id);

    const patchResponse = await fetch(`${BASE_URL}/api/logs/${created.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(cookies),
      },
      body: JSON.stringify({
        assignmentId: assignments[1]?.id,
        usageSubsections: ['critique-and-quality-improvement'],
        usageReason: 'Updated reason after revisiting the declaration draft.',
        sessionDescription: 'Updated details',
        aiTool: 'Claude',
        usageEvidence: [
          {
            nodeId: 'critique-and-quality-improvement',
            text: 'Updated evidence text',
          },
        ],
      }),
    });
    assert.equal(patchResponse.status, 200);

    const patched = (await patchResponse.json()) as {
      assignmentId: string;
      usageSubsections: string[];
      usageReason: string;
      sessionDescription: string | null;
      aiTool: string;
    };
    assert.equal(patched.assignmentId, assignments[1]?.id);
    assert.deepEqual(patched.usageSubsections, ['critique-and-quality-improvement']);
    assert.equal(patched.usageReason, 'Updated reason after revisiting the declaration draft.');
    assert.equal(patched.sessionDescription, 'Updated details');
    assert.equal(patched.aiTool, 'Claude');

    const links = await prisma.conversationLink.findMany({
      where: { aiLogId: created.id },
      orderBy: [{ createdAt: 'asc' }],
    });
    assert.equal(links.length, 1);
    assert.equal(links[0]?.usageNodeId, 'critique-and-quality-improvement');
  });
});
