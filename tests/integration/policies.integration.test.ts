import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { SeverityLevel } from '@prisma/client';

import { prisma } from '../../src/lib/db/client';

const PORT = 3212;
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

describe('POST /api/policies/[id]/publish', () => {
  test('policy list visibility and active policy payload follow role rules', async () => {
    const adminCookies = await login('admin@ntnu.no', 'Admin User');
    const studentCookies = await login('student@ntnu.no', 'Student User');

    const draftVersion = `NTNU-Policy-draft-${Date.now()}`;
    const createResponse = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(adminCookies),
      },
      body: JSON.stringify({
        versionNumber: draftVersion,
        description: 'Draft for visibility test',
        rules: [
          {
            usageCategory: 'Grammar Fix',
            severityLevel: SeverityLevel.ALLOWED,
            ruleReference: 'NTNU-AI-D.1',
            keywords: ['grammar'],
          },
        ],
      }),
    });
    assert.equal(createResponse.status, 201);

    const adminListResponse = await fetch(`${BASE_URL}/api/policies`, {
      headers: { cookie: serializeCookies(adminCookies) },
    });
    assert.equal(adminListResponse.status, 200);
    const adminListPayload = (await adminListResponse.json()) as {
      versions: Array<{ versionNumber: string; status: string }>;
    };
    assert.ok(
      adminListPayload.versions.some(
        (version) => version.versionNumber === draftVersion && version.status === 'DRAFT',
      ),
    );

    const studentListResponse = await fetch(`${BASE_URL}/api/policies`, {
      headers: { cookie: serializeCookies(studentCookies) },
    });
    assert.equal(studentListResponse.status, 200);
    const studentListPayload = (await studentListResponse.json()) as {
      versions: Array<{ versionNumber: string; status: string }>;
    };
    assert.ok(
      studentListPayload.versions.every((version) => version.status !== 'DRAFT'),
    );

    const activeResponse = await fetch(`${BASE_URL}/api/policies/active`, {
      headers: { cookie: serializeCookies(studentCookies) },
    });
    assert.equal(activeResponse.status, 200);
    const activePayload = (await activeResponse.json()) as {
      status: string;
      rules: Array<{ keywords: string[] }>;
    };
    assert.equal(activePayload.status, 'ACTIVE');
    assert.ok(activePayload.rules.length >= 5);
    assert.ok(activePayload.rules.every((rule) => Array.isArray(rule.keywords)));
  });

  test('rejects non-admin policy creation with 403', async () => {
    const studentCookies = await login('student@ntnu.no', 'Student User');

    const response = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(studentCookies),
      },
      body: JSON.stringify({
        versionNumber: `NTNU-Policy-forbidden-${Date.now()}`,
        rules: [
          {
            usageCategory: 'Grammar Fix',
            severityLevel: SeverityLevel.ALLOWED,
            ruleReference: 'NTNU-AI-F.1',
            keywords: ['grammar'],
          },
        ],
      }),
    });

    assert.equal(response.status, 403);
  });

  test('rejects student access to admin policy page route via middleware', async () => {
    const studentCookies = await login('student@ntnu.no', 'Student User');
    const response = await fetch(`${BASE_URL}/policies`, {
      headers: {
        cookie: serializeCookies(studentCookies),
      },
      redirect: 'manual',
    });

    assert.equal(response.status, 403);
  });

  test('archives old active version and creates policy change notifications', async () => {
    const adminCookies = await login('admin@ntnu.no', 'Admin User');

    const oldActive = await prisma.policyVersion.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    assert.ok(oldActive?.id);

    const student = await prisma.user.findUnique({
      where: { email: 'student@ntnu.no' },
      select: { id: true },
    });
    assert.ok(student?.id);

    const notificationCountBefore = await prisma.policyChangeNotification.count({
      where: { userId: student.id },
    });

    const createResponse = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(adminCookies),
      },
      body: JSON.stringify({
        versionNumber: `NTNU-Policy-v2.${Date.now()}`,
        description: 'Updated severity thresholds',
        rules: [
          {
            usageCategory: 'Grammar Fix',
            severityLevel: SeverityLevel.MINOR,
            ruleReference: 'NTNU-AI-2.1',
            description: 'Grammar support requires disclosure.',
            keywords: ['grammar', 'proofread'],
          },
          {
            usageCategory: 'Code Debugging',
            severityLevel: SeverityLevel.MINOR,
            ruleReference: 'NTNU-AI-2.2',
            description: 'Debug support permitted with explanation.',
            keywords: ['debug', 'traceback'],
          },
          {
            usageCategory: 'Code Generation',
            severityLevel: SeverityLevel.SERIOUS,
            ruleReference: 'NTNU-AI-2.3',
            description: 'Large generated fragments are high risk.',
            keywords: ['generate code', 'implementation'],
          },
          {
            usageCategory: 'Brainstorming',
            severityLevel: SeverityLevel.ALLOWED,
            ruleReference: 'NTNU-AI-2.4',
            description: 'Brainstorming remains allowed.',
            keywords: ['ideas', 'brainstorm'],
          },
          {
            usageCategory: 'Full Text Generation',
            severityLevel: SeverityLevel.FORBIDDEN,
            ruleReference: 'NTNU-AI-2.5',
            description: 'Submitting AI-written full text is forbidden.',
            keywords: ['full text', 'write full essay'],
          },
          {
            usageCategory: 'Data Analysis Automation',
            severityLevel: SeverityLevel.MODERATE,
            ruleReference: 'NTNU-AI-2.6',
            description: 'Automated analysis must be disclosed.',
            keywords: ['analyze dataset', 'automate analysis'],
          },
        ],
      }),
    });
    assert.equal(createResponse.status, 201);

    const createPayload = (await createResponse.json()) as {
      policyVersionId: string;
      status: 'DRAFT';
    };
    assert.ok(createPayload.policyVersionId);
    assert.equal(createPayload.status, 'DRAFT');

    const publishResponse = await fetch(
      `${BASE_URL}/api/policies/${createPayload.policyVersionId}/publish`,
      {
        method: 'POST',
        headers: {
          cookie: serializeCookies(adminCookies),
        },
      },
    );
    assert.equal(publishResponse.status, 200);

    const oldAfterPublish = await prisma.policyVersion.findUnique({
      where: { id: oldActive.id },
      select: { status: true, archivedAt: true },
    });
    assert.ok(oldAfterPublish);
    assert.equal(oldAfterPublish.status, 'ARCHIVED');
    assert.ok(oldAfterPublish.archivedAt);

    const createdVersion = await prisma.policyVersion.findUnique({
      where: { id: createPayload.policyVersionId },
      select: { status: true },
    });
    assert.ok(createdVersion);
    assert.equal(createdVersion.status, 'ACTIVE');

    const notificationCountAfter = await prisma.policyChangeNotification.count({
      where: { userId: student.id },
    });
    assert.ok(notificationCountAfter > notificationCountBefore);
  });
});
