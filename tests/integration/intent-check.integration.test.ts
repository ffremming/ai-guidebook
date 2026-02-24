import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';

import { prisma } from '../../src/lib/db/client';

const PORT = 3214;
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle] ?? 0;
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

describe('POST /api/compliance/intent-check', () => {
  test('returns 401 for unauthenticated request', async () => {
    const response = await fetch(`${BASE_URL}/api/compliance/intent-check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'help me generate code',
        assignmentId: '00000000-0000-0000-0000-000000000000',
      }),
    });

    assert.equal(response.status, 401);
  });

  test('returns 400 for invalid assignmentId', async () => {
    const cookies = await login('student@ntnu.no', 'Student User');

    const response = await fetch(`${BASE_URL}/api/compliance/intent-check`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(cookies),
      },
      body: JSON.stringify({
        reason: 'help me generate code',
        assignmentId: 'not-a-uuid',
      }),
    });

    assert.equal(response.status, 400);
  });

  test('responds with median latency under 500ms and performs no writes', async () => {
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

    const beforeComplianceChecks = await prisma.complianceCheck.count();
    const beforeAiLogs = await prisma.aiLog.count();

    const samples: number[] = [];

    for (let i = 0; i < 9; i += 1) {
      const startedAt = performance.now();
      const response = await fetch(`${BASE_URL}/api/compliance/intent-check`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: serializeCookies(cookies),
        },
        body: JSON.stringify({
          reason: 'help me generate code',
          assignmentId: assignment.id,
        }),
      });
      const elapsedMs = performance.now() - startedAt;
      samples.push(elapsedMs);

      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        status: string;
        detectedCategory: string | null;
      };
      assert.equal(payload.status, 'WARNING');
      assert.equal(payload.detectedCategory, 'Code Generation');
    }

    const afterComplianceChecks = await prisma.complianceCheck.count();
    const afterAiLogs = await prisma.aiLog.count();

    assert.equal(afterComplianceChecks, beforeComplianceChecks);
    assert.equal(afterAiLogs, beforeAiLogs);

    const medianMs = median(samples);
    assert.ok(medianMs < 500, `Expected median latency < 500ms, got ${medianMs.toFixed(2)}ms`);
  });
});
