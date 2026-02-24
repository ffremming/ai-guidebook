import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';

import { ComplianceStatus, ResolutionStatus } from '@prisma/client';

import { prisma } from '../../src/lib/db/client';
import { encryptText } from '../../src/lib/encryption/aes';

const PORT = 3218;
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

describe('Resolution API', () => {
  test('submits resolution and preserves original system classification', async () => {
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

    const log = await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignment.id,
        usageReason: encryptText('Asked for grammar support only'),
        sessionDescription: encryptText('Prompt drifted into code generation'),
        aiTool: 'ChatGPT',
        intentCategory: 'Grammar Fix',
        actualUsageCategory: 'Code Generation',
        appliedPolicyVersionId: assignment.pinnedPolicyVersionId ?? activePolicy.id,
        complianceStatus: ComplianceStatus.NON_COMPLIANT,
        conflictFlag: true,
        directViolationFlag: false,
        flagSeverity: 'MODERATE',
        resolutionStatus: ResolutionStatus.UNRESOLVED,
      },
      select: { id: true, actualUsageCategory: true },
    });

    const studentCookies = await login('student@ntnu.no', 'Student User');
    const instructorCookies = await login('instructor@ntnu.no', 'Instructor User');

    const submitResponse = await fetch(`${BASE_URL}/api/resolutions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: serializeCookies(studentCookies),
      },
      body: JSON.stringify({
        logId: log.id,
        narrativeExplanation:
          'I used generated snippets only as references and rewrote everything myself.',
        disputedCategory: 'Code Debugging',
        disputeEvidence: 'The final submission contains only original student-authored code.',
      }),
    });
    assert.equal(submitResponse.status, 201);

    const storedResolution = await prisma.resolution.findUnique({
      where: { aiLogId: log.id },
      select: {
        id: true,
        originalSystemCategory: true,
      },
    });
    assert.ok(storedResolution?.id);
    assert.equal(storedResolution.originalSystemCategory, log.actualUsageCategory);

    const updatedLog = await prisma.aiLog.findUnique({
      where: { id: log.id },
      select: {
        resolutionStatus: true,
        actualUsageCategory: true,
        conflictFlag: true,
        directViolationFlag: true,
        complianceStatus: true,
      },
    });
    assert.equal(updatedLog?.resolutionStatus, 'STUDENT_RESPONDED');
    assert.equal(updatedLog?.actualUsageCategory, log.actualUsageCategory);
    assert.equal(updatedLog?.conflictFlag, true);
    assert.equal(updatedLog?.directViolationFlag, false);
    assert.equal(updatedLog?.complianceStatus, 'NON_COMPLIANT');

    const getAsInstructor = await fetch(`${BASE_URL}/api/resolutions/${log.id}`, {
      headers: {
        cookie: serializeCookies(instructorCookies),
      },
    });
    assert.equal(getAsInstructor.status, 200);
    const payload = (await getAsInstructor.json()) as {
      resolution: { id: string } | null;
      originalFlag: { conflictFlag: boolean };
      originalSystemCategory: string | null;
    };
    assert.ok(payload.resolution?.id);
    assert.equal(payload.originalFlag.conflictFlag, true);
    assert.equal(payload.originalSystemCategory, log.actualUsageCategory);

    const staffAudit = await prisma.auditLog.findFirst({
      where: {
        actorId: instructor.id,
        actionType: 'STAFF_VIEW',
        resourceType: 'resolution',
        resourceId: log.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(staffAudit?.id);
  });
});
