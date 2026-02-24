import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';

import { PolicyStatus, UserRole } from '@prisma/client';

import { prisma } from '../../src/lib/db/client';

const PORT = 3220;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess: ChildProcessWithoutNullStreams | null = null;

function addCookiesFromResponse(response: Response, cookieJar: Map<string, string>): void {
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
      // startup in progress
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
  if (!serverProcess) return;
  serverProcess.kill('SIGTERM');
  await delay(500);
  if (!serverProcess.killed) {
    serverProcess.kill('SIGKILL');
  }
});

describe('notifications API', () => {
  test('returns scoped notifications and allows marking read', async () => {
    const timestamp = Date.now();
    const studentEmail = `notifications.student.${timestamp}@ntnu.no`;
    const otherEmail = `notifications.other.${timestamp}@ntnu.no`;

    const student = await prisma.user.create({
      data: {
        email: studentEmail,
        name: 'Notifications Student',
        role: UserRole.STUDENT,
        authSubject: `local:${studentEmail}`,
      },
      select: { id: true },
    });

    await prisma.user.create({
      data: {
        email: otherEmail,
        name: 'Notifications Other',
        role: UserRole.STUDENT,
        authSubject: `local:${otherEmail}`,
      },
      select: { id: true },
    });

    const assignment = await prisma.assignment.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    assert.ok(assignment?.id);

    const activePolicy = await prisma.policyVersion.findFirst({
      where: { status: PolicyStatus.ACTIVE },
      select: { id: true },
    });
    assert.ok(activePolicy?.id);

    const archivedPolicy = await prisma.policyVersion.create({
      data: {
        versionNumber: `ARCHIVE-NOTIF-${timestamp}`,
        description: 'Archived notification policy',
        status: PolicyStatus.ARCHIVED,
        archivedAt: new Date(),
      },
      select: { id: true },
    });

    const notification = await prisma.policyChangeNotification.create({
      data: {
        userId: student.id,
        assignmentId: assignment.id,
        oldPolicyVersionId: archivedPolicy.id,
        newPolicyVersionId: activePolicy.id,
        changeSummary: 'Severity changed for code generation category',
        isRead: false,
      },
      select: { id: true },
    });

    const unauthenticated = await fetch(`${BASE_URL}/api/notifications`);
    assert.equal(unauthenticated.status, 401);

    const studentCookies = await login(studentEmail, 'Notifications Student');
    const getResponse = await fetch(`${BASE_URL}/api/notifications`, {
      headers: {
        cookie: serializeCookies(studentCookies),
      },
    });
    assert.equal(getResponse.status, 200);

    const getPayload = (await getResponse.json()) as {
      notifications: Array<{ id: string; isRead: boolean; assignmentId: string; changeSummary: string }>;
      unreadCount: number;
    };
    assert.equal(getPayload.unreadCount, 1);
    assert.equal(getPayload.notifications.some((item) => item.id === notification.id), true);

    const otherCookies = await login(otherEmail, 'Notifications Other');
    const forbiddenPatch = await fetch(`${BASE_URL}/api/notifications/${notification.id}`, {
      method: 'PATCH',
      headers: {
        cookie: serializeCookies(otherCookies),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    });
    assert.equal(forbiddenPatch.status, 403);

    const patchResponse = await fetch(`${BASE_URL}/api/notifications/${notification.id}`, {
      method: 'PATCH',
      headers: {
        cookie: serializeCookies(studentCookies),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    });
    assert.equal(patchResponse.status, 200);
    const patched = (await patchResponse.json()) as { id: string; isRead: boolean };
    assert.equal(patched.id, notification.id);
    assert.equal(patched.isRead, true);

    const getAfterPatch = await fetch(`${BASE_URL}/api/notifications`, {
      headers: {
        cookie: serializeCookies(studentCookies),
      },
    });
    assert.equal(getAfterPatch.status, 200);
    const afterPayload = (await getAfterPatch.json()) as {
      unreadCount: number;
      notifications: Array<{ id: string; isRead: boolean }>;
    };
    assert.equal(afterPayload.unreadCount, 0);
    assert.equal(
      afterPayload.notifications.find((item) => item.id === notification.id)?.isRead,
      true,
    );
  });
});
