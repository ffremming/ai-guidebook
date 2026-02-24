import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';

import { ComplianceStatus, ResolutionStatus } from '@prisma/client';

import { prisma } from '../../src/lib/db/client';
import { encryptText } from '../../src/lib/encryption/aes';

const PORT = 3217;
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
      // Startup in progress.
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

describe('Declaration API', () => {
  test('generates summary from logs, saves remarks, exports, and records staff view', async () => {
    const student = await prisma.user.findUnique({
      where: { email: 'student@ntnu.no' },
      select: { id: true },
    });
    const instructor = await prisma.user.findUnique({
      where: { email: 'instructor@ntnu.no' },
      select: { id: true },
    });
    assert.ok(student?.id);
    assert.ok(instructor?.id);

    const assignment = await prisma.assignment.findFirst({
      where: {
        course: {
          enrollments: {
            some: {
              userId: instructor.id,
              role: 'INSTRUCTOR',
            },
          },
        },
      },
      select: { id: true, pinnedPolicyVersionId: true },
    });
    assert.ok(assignment?.id);

    const activePolicy = await prisma.policyVersion.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    assert.ok(activePolicy?.id);

    if (!assignment.pinnedPolicyVersionId) {
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { pinnedPolicyVersionId: activePolicy.id },
      });
    }

    await prisma.declaration.deleteMany({
      where: {
        userId: student.id,
        assignmentId: assignment.id,
      },
    });

    const log1 = await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignment.id,
        usageReason: encryptText('Used AI for grammar fixes and sentence cleanup'),
        sessionDescription: encryptText('Asked for punctuation correction'),
        aiTool: 'ChatGPT',
        intentCategory: 'Grammar Fix',
        actualUsageCategory: 'Grammar Fix',
        appliedPolicyVersionId: assignment.pinnedPolicyVersionId ?? activePolicy.id,
        complianceStatus: ComplianceStatus.COMPLIANT,
        resolutionStatus: ResolutionStatus.NONE,
      },
      select: { id: true },
    });

    const log2 = await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignment.id,
        usageReason: encryptText('Asked for implementation ideas'),
        sessionDescription: encryptText('Prompted it to generate code snippets'),
        aiTool: 'Claude',
        intentCategory: 'Grammar Fix',
        actualUsageCategory: 'Code Generation',
        appliedPolicyVersionId: assignment.pinnedPolicyVersionId ?? activePolicy.id,
        complianceStatus: ComplianceStatus.NON_COMPLIANT,
        conflictFlag: true,
        flagSeverity: 'MODERATE',
        resolutionStatus: ResolutionStatus.UNRESOLVED,
      },
      select: { id: true },
    });

    const studentCookies = await login('student@ntnu.no', 'Student User');
    const instructorCookies = await login('instructor@ntnu.no', 'Instructor User');

    const getResponse = await fetch(`${BASE_URL}/api/declarations/${assignment.id}`, {
      headers: {
        cookie: serializeCookies(studentCookies),
      },
    });
    assert.equal(getResponse.status, 200);
    const declaration = (await getResponse.json()) as {
      id: string;
      systemSummary: string;
      policyVersion: { versionNumber: string };
    };
    assert.ok(declaration.systemSummary.includes(log1.id));
    assert.ok(declaration.systemSummary.includes(log2.id));
    assert.ok(declaration.systemSummary.includes('ChatGPT'));
    assert.ok(declaration.systemSummary.includes('Claude'));
    assert.ok(declaration.policyVersion.versionNumber);

    const patchResponse = await fetch(`${BASE_URL}/api/declarations/${assignment.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(studentCookies),
      },
      body: JSON.stringify({
        studentRemarks: 'I reviewed all flagged sections and clarified my process.',
      }),
    });
    assert.equal(patchResponse.status, 200);

    const exportResponse = await fetch(`${BASE_URL}/api/declarations/${assignment.id}/export`, {
      method: 'POST',
      headers: {
        cookie: serializeCookies(studentCookies),
      },
    });
    assert.equal(exportResponse.status, 200);
    const exported = (await exportResponse.json()) as {
      systemSummary: string;
      studentRemarks: string | null;
      policyVersionNumber: string;
      logs: Array<{ id: string }>;
      flags: Array<{ logId: string }>;
      exportedAt: string | null;
    };
    assert.ok(exported.systemSummary.includes(log1.id));
    assert.ok(exported.systemSummary.includes(log2.id));
    assert.equal(exported.studentRemarks, 'I reviewed all flagged sections and clarified my process.');
    assert.ok(exported.policyVersionNumber);
    assert.ok(exported.logs.some((log) => log.id === log1.id));
    assert.ok(exported.logs.some((log) => log.id === log2.id));
    assert.ok(exported.flags.some((flag) => flag.logId === log2.id));
    assert.ok(exported.exportedAt);

    const storedDeclaration = await prisma.declaration.findUnique({
      where: {
        userId_assignmentId: {
          userId: student.id,
          assignmentId: assignment.id,
        },
      },
      select: {
        status: true,
      },
    });
    assert.equal(storedDeclaration?.status, 'EXPORTED');

    const instructorGet = await fetch(
      `${BASE_URL}/api/declarations/${assignment.id}?userId=${encodeURIComponent(student.id)}`,
      {
        headers: {
          cookie: serializeCookies(instructorCookies),
        },
      },
    );
    assert.equal(instructorGet.status, 200);

    const staffAudit = await prisma.auditLog.findFirst({
      where: {
        actorId: instructor.id,
        actionType: 'STAFF_VIEW',
        resourceType: 'declaration',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(staffAudit?.id);
  });
});
