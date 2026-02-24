import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';

import { ComplianceStatus, ResolutionStatus } from '@prisma/client';

import { prisma } from '../../src/lib/db/client';
import { encryptText } from '../../src/lib/encryption/aes';

const PORT = 3215;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const INTERNAL_TOKEN = 'integration-internal-token';

let serverProcess: ChildProcessWithoutNullStreams | null = null;

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
    env: {
      ...process.env,
      INTERNAL_CLASSIFY_TOKEN: INTERNAL_TOKEN,
    },
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

describe('POST /api/compliance/classify', () => {
  test('returns 401 when internal token is missing', async () => {
    const response = await fetch(`${BASE_URL}/api/compliance/classify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ logId: '00000000-0000-0000-0000-000000000000' }),
    });

    assert.equal(response.status, 401);
  });

  test('returns 404 for unknown logId', async () => {
    const response = await fetch(`${BASE_URL}/api/compliance/classify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': INTERNAL_TOKEN,
      },
      body: JSON.stringify({ logId: '00000000-0000-0000-0000-000000000000' }),
    });

    assert.equal(response.status, 404);
  });

  test('classifies log and sets conflict + unresolved resolution status', async () => {
    const student = await prisma.user.findUnique({
      where: { email: 'student@ntnu.no' },
      select: { id: true },
    });
    assert.ok(student?.id);

    const assignment = await prisma.assignment.findFirst({
      where: {
        course: {
          enrollments: {
            some: {
              userId: student.id,
              role: 'STUDENT',
            },
          },
        },
      },
      select: { id: true },
    });
    assert.ok(assignment?.id);

    const activePolicy = await prisma.policyVersion.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    assert.ok(activePolicy?.id);

    const log = await prisma.aiLog.create({
      data: {
        userId: student.id,
        assignmentId: assignment.id,
        usageReason: encryptText('I only need grammar proofreading help'),
        sessionDescription: encryptText('Please generate code and scaffold function modules'),
        aiTool: 'ChatGPT',
        complianceStatus: ComplianceStatus.PENDING,
        intentCategory: 'Grammar Fix',
        appliedPolicyVersionId: activePolicy.id,
        resolutionStatus: ResolutionStatus.NONE,
      },
      select: { id: true },
    });

    const response = await fetch(`${BASE_URL}/api/compliance/classify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': INTERNAL_TOKEN,
      },
      body: JSON.stringify({ logId: log.id }),
    });
    assert.equal(response.status, 200);

    const updated = await prisma.aiLog.findUnique({
      where: { id: log.id },
      select: {
        conflictFlag: true,
        directViolationFlag: true,
        complianceStatus: true,
        resolutionStatus: true,
        actualUsageCategory: true,
      },
    });
    assert.ok(updated);
    assert.equal(updated.actualUsageCategory, 'Code Generation');
    assert.equal(updated.conflictFlag, true);
    assert.equal(updated.directViolationFlag, false);
    assert.equal(updated.complianceStatus, 'NON_COMPLIANT');
    assert.equal(updated.resolutionStatus, 'UNRESOLVED');

    const check = await prisma.complianceCheck.findFirst({
      where: { aiLogId: log.id, checkType: 'POST_SESSION' },
      select: {
        id: true,
        detectedCategory: true,
      },
    });
    assert.ok(check?.id);
    assert.equal(check.detectedCategory, 'Code Generation');
  });

  test('returns 409 when log is already classified', async () => {
    const alreadyClassified = await prisma.aiLog.findFirst({
      where: {
        complianceStatus: {
          not: ComplianceStatus.PENDING,
        },
      },
      select: { id: true },
    });
    assert.ok(alreadyClassified?.id);

    const response = await fetch(`${BASE_URL}/api/compliance/classify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': INTERNAL_TOKEN,
      },
      body: JSON.stringify({ logId: alreadyClassified.id }),
    });

    assert.equal(response.status, 409);
  });
});
