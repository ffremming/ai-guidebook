import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';

import {
  AssignmentStatus,
  ComplianceStatus,
  EnrollmentRole,
  PolicyStatus,
  ResolutionStatus,
  UserRole,
} from '@prisma/client';

import { prisma } from '../../src/lib/db/client';
import { encryptText } from '../../src/lib/encryption/aes';

const PORT = 3219;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DASH_NAME = 'Dashboard Student';

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

describe('GET /api/dashboard', () => {
  test('aggregates action items, assignment statuses, recent logs, and unread notifications', async () => {
    const dashEmail = `dashboard.student.${Date.now()}@ntnu.no`;

    const student = await prisma.user.upsert({
      where: { email: dashEmail },
      update: {
        name: DASH_NAME,
        role: UserRole.STUDENT,
        authSubject: `local:${dashEmail}`,
      },
      create: {
        email: dashEmail,
        name: DASH_NAME,
        role: UserRole.STUDENT,
        authSubject: `local:${dashEmail}`,
      },
      select: { id: true },
    });

    const course = await prisma.course.create({
      data: {
        courseCode: `DASH-${Date.now()}`,
        name: 'Dashboard Integration Course',
        institution: 'NTNU',
      },
      select: { id: true },
    });

    await prisma.enrollment.create({
      data: {
        userId: student.id,
        courseId: course.id,
        role: EnrollmentRole.STUDENT,
      },
    });

    const [assignmentA, assignmentB, assignmentC] = await Promise.all([
      prisma.assignment.create({
        data: {
          courseId: course.id,
          title: 'Assignment A',
          assignmentCode: `DASH-A-${Date.now()}`,
          status: AssignmentStatus.ACTIVE,
        },
      }),
      prisma.assignment.create({
        data: {
          courseId: course.id,
          title: 'Assignment B',
          assignmentCode: `DASH-B-${Date.now()}`,
          status: AssignmentStatus.ACTIVE,
        },
      }),
      prisma.assignment.create({
        data: {
          courseId: course.id,
          title: 'Assignment C',
          assignmentCode: `DASH-C-${Date.now()}`,
          status: AssignmentStatus.ACTIVE,
        },
      }),
    ]);

    const activePolicy = await prisma.policyVersion.findFirst({
      where: { status: PolicyStatus.ACTIVE },
      select: { id: true },
    });
    assert.ok(activePolicy?.id);

    const archivedPolicy = await prisma.policyVersion.create({
      data: {
        versionNumber: `ARCHIVE-DASH-${Date.now()}`,
        status: PolicyStatus.ARCHIVED,
        description: 'Archived policy for dashboard test',
        archivedAt: new Date(),
      },
      select: { id: true },
    });

    const longReason =
      'This is a very long usage reason that should be truncated at one hundred characters when returned by the dashboard endpoint for recent log previews.';

    const now = Date.now();
    const logUnresolved = await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignmentA.id,
        usageReason: encryptText(longReason),
        sessionDescription: encryptText('Session details for unresolved log'),
        aiTool: 'ChatGPT',
        intentCategory: 'Grammar Fix',
        actualUsageCategory: 'Code Generation',
        appliedPolicyVersionId: activePolicy.id,
        complianceStatus: ComplianceStatus.NON_COMPLIANT,
        conflictFlag: true,
        flagSeverity: 'MODERATE',
        resolutionStatus: ResolutionStatus.UNRESOLVED,
        createdAt: new Date(now - 60_000),
      },
      select: { id: true },
    });

    const logResolved = await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignmentB.id,
        usageReason: encryptText('Resolved flagged log reason'),
        sessionDescription: encryptText('Resolved log session details'),
        aiTool: 'Claude',
        intentCategory: 'Code Debugging',
        actualUsageCategory: 'Code Generation',
        appliedPolicyVersionId: activePolicy.id,
        complianceStatus: ComplianceStatus.NON_COMPLIANT,
        conflictFlag: true,
        flagSeverity: 'MODERATE',
        resolutionStatus: ResolutionStatus.STUDENT_RESPONDED,
        createdAt: new Date(now - 30_000),
      },
      select: { id: true },
    });

    const logCompliant = await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignmentC.id,
        usageReason: encryptText('Compliant brainstorming support'),
        sessionDescription: encryptText('No flagged content'),
        aiTool: 'Gemini',
        intentCategory: 'Brainstorming',
        actualUsageCategory: 'Brainstorming',
        appliedPolicyVersionId: activePolicy.id,
        complianceStatus: ComplianceStatus.COMPLIANT,
        resolutionStatus: ResolutionStatus.NONE,
        createdAt: new Date(now - 10_000),
      },
      select: { id: true },
    });

    await prisma.policyChangeNotification.createMany({
      data: [
        {
          userId: student.id,
          assignmentId: assignmentA.id,
          oldPolicyVersionId: archivedPolicy.id,
          newPolicyVersionId: activePolicy.id,
          changeSummary: 'Policy update unread',
          isRead: false,
        },
        {
          userId: student.id,
          assignmentId: assignmentB.id,
          oldPolicyVersionId: archivedPolicy.id,
          newPolicyVersionId: activePolicy.id,
          changeSummary: 'Policy update read',
          isRead: true,
        },
      ],
    });

    const unauthenticated = await fetch(`${BASE_URL}/api/dashboard`);
    assert.equal(unauthenticated.status, 401);

    const studentCookies = await login(dashEmail, DASH_NAME);
    const response = await fetch(`${BASE_URL}/api/dashboard`, {
      headers: {
        cookie: serializeCookies(studentCookies),
      },
    });
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      actionItems: Array<{
        logId: string;
        assignmentTitle: string;
        flagSeverity: string | null;
        resolveUrl: string;
      }>;
      assignmentStatuses: Array<{
        assignmentId: string;
        assignmentTitle: string;
        status: 'READY' | 'PENDING';
        pendingCount: number;
      }>;
      recentLogs: Array<{
        id: string;
        usageReason: string;
        userStatedIntent: string | null;
        systemClassification: string | null;
        complianceStatus: string;
        resolutionStatus: string;
      }>;
      unreadNotificationCount: number;
    };

    assert.deepEqual(payload.actionItems, [
      {
        logId: logUnresolved.id,
        assignmentTitle: 'Assignment A',
        flagSeverity: 'MODERATE',
        resolveUrl: `/resolve/${logUnresolved.id}`,
      },
    ]);

    assert.deepEqual(
      payload.assignmentStatuses
        .map((item) => ({
          assignmentTitle: item.assignmentTitle,
          status: item.status,
          pendingCount: item.pendingCount,
        }))
        .sort((a, b) => a.assignmentTitle.localeCompare(b.assignmentTitle)),
      [
        { assignmentTitle: 'Assignment A', status: 'PENDING', pendingCount: 1 },
        { assignmentTitle: 'Assignment B', status: 'READY', pendingCount: 0 },
        { assignmentTitle: 'Assignment C', status: 'READY', pendingCount: 0 },
      ],
    );

    assert.deepEqual(payload.recentLogs.map((log) => log.id), [
      logCompliant.id,
      logResolved.id,
      logUnresolved.id,
    ]);
    assert.equal(payload.recentLogs[2]?.usageReason.length, 100);
    assert.equal(payload.recentLogs[2]?.usageReason, longReason.slice(0, 100));
    assert.equal(payload.recentLogs[2]?.userStatedIntent, 'Grammar Fix');
    assert.equal(payload.recentLogs[2]?.systemClassification, 'Code Generation');
    assert.equal(payload.recentLogs[2]?.complianceStatus, 'NON_COMPLIANT');
    assert.equal(payload.recentLogs[2]?.resolutionStatus, 'UNRESOLVED');

    assert.equal(payload.unreadNotificationCount, 1);
  });
});
