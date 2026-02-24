import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';

import { ComplianceStatus, EnrollmentRole, PolicyStatus, ResolutionStatus, UserRole } from '@prisma/client';

import { prisma } from '../../src/lib/db/client';
import { encryptText } from '../../src/lib/encryption/aes';

const PORT = 3221;
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

describe('STAFF_VIEW audit logging', () => {
  test('instructor viewing student logs writes STAFF_VIEW audit row with actor and resource', async () => {
    const timestamp = Date.now();
    const studentEmail = `staffview.student.${timestamp}@ntnu.no`;
    const instructorEmail = `staffview.instructor.${timestamp}@ntnu.no`;

    const student = await prisma.user.create({
      data: {
        email: studentEmail,
        name: 'StaffView Student',
        role: UserRole.STUDENT,
        authSubject: `local:${studentEmail}`,
      },
      select: { id: true },
    });

    const instructor = await prisma.user.create({
      data: {
        email: instructorEmail,
        name: 'StaffView Instructor',
        role: UserRole.INSTRUCTOR,
        authSubject: `local:${instructorEmail}`,
      },
      select: { id: true },
    });

    const course = await prisma.course.create({
      data: {
        courseCode: `SV-${timestamp}`,
        name: 'Staff View Course',
        institution: 'NTNU',
      },
      select: { id: true },
    });

    await prisma.enrollment.createMany({
      data: [
        { userId: student.id, courseId: course.id, role: EnrollmentRole.STUDENT },
        { userId: instructor.id, courseId: course.id, role: EnrollmentRole.INSTRUCTOR },
      ],
    });

    const assignment = await prisma.assignment.create({
      data: {
        courseId: course.id,
        title: 'Staff View Assignment',
      },
      select: { id: true },
    });

    const activePolicy = await prisma.policyVersion.findFirst({
      where: { status: PolicyStatus.ACTIVE },
      select: { id: true },
    });
    assert.ok(activePolicy?.id);

    await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignment.id,
        usageReason: encryptText('Grammar help'),
        sessionDescription: encryptText('Minor corrections'),
        aiTool: 'ChatGPT',
        complianceStatus: ComplianceStatus.COMPLIANT,
        appliedPolicyVersionId: activePolicy.id,
        resolutionStatus: ResolutionStatus.NONE,
      },
    });

    const cookies = await login(instructorEmail, 'StaffView Instructor');
    const auditStart = new Date();

    const logsResponse = await fetch(
      `${BASE_URL}/api/logs?userId=${encodeURIComponent(student.id)}`,
      {
        headers: {
          cookie: serializeCookies(cookies),
        },
      },
    );
    assert.equal(logsResponse.status, 200);

    const auditRows = await prisma.auditLog.findMany({
      where: {
        actorId: instructor.id,
        actionType: 'STAFF_VIEW',
        resourceType: 'ai_log_list',
        createdAt: {
          gte: auditStart,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 5,
      select: {
        actorId: true,
        resourceId: true,
        metadataJson: true,
      },
    });

    assert.ok(auditRows.length > 0);
    const entry = auditRows[0];
    assert.equal(entry.actorId, instructor.id);
    assert.equal(entry.resourceId, student.id);

    const metadata = entry.metadataJson as Record<string, unknown>;
    assert.equal(metadata.requestedUserId, student.id);
  });
});
