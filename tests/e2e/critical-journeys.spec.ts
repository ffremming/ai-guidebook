import { expect, test, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db/client';

async function login(page: Page, email: string, name: string) {
  await page.goto('/login');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard**');
}

test.describe.configure({ mode: 'serial' });

test('Log to Declaration (mobile): student submits log, resolves, exports declaration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'student@ntnu.no', 'Student User');

  await page.goto('/log');

  const firstCourseValue = await page
    .locator('#course-selector-options option')
    .first()
    .getAttribute('value');
  expect(firstCourseValue).toBeTruthy();
  await page.locator('#course-selector').fill(firstCourseValue!);

  const assignmentSelect = page.locator('#assignmentId');
  await expect(assignmentSelect).toBeEnabled();
  await assignmentSelect.selectOption({ index: 1 });

  await page.getByLabel('Critique and quality improvement').click();
  await page.getByLabel('Text correction (grammar/spelling)').click();

  await page.getByLabel('AI tool').fill('ChatGPT');
  await page
    .getByLabel('Usage reason')
    .fill('Please help with grammar and wording in my essay introduction.');
  await page
    .getByLabel('Session description (optional)')
    .fill('The AI suggested to write full essay and complete report for me.');

  await page.getByRole('button', { name: 'Add URL or comment' }).first().click();
  await page
    .getByPlaceholder('Add URL or comment...')
    .first()
    .fill('https://chat.example.com/session-1');

  await page.getByRole('button', { name: 'Submit log' }).click();
  await page.waitForURL('**/dashboard?toast=log-created');

  const logsPayload = await page.request.get('/api/logs');
  expect(logsPayload.ok()).toBeTruthy();
  const logsJson = (await logsPayload.json()) as {
    logs: Array<{ id: string }>;
  };
  const createdLogId = logsJson.logs[0]?.id;
  expect(createdLogId).toBeTruthy();

  const internalToken = process.env.INTERNAL_CLASSIFY_TOKEN ?? process.env.NEXTAUTH_SECRET ?? '';
  expect(internalToken).not.toBe('');
  await page.request.post('/api/compliance/classify', {
    headers: { 'x-internal-token': internalToken },
    data: { logId: createdLogId },
  });

  await page.goto('/dashboard');
  const resolveLink = page.getByRole('link', { name: 'Resolve' }).first();
  await expect(resolveLink).toBeVisible({ timeout: 40_000 });
  await resolveLink.click();
  await page.waitForURL('**/resolve/**');

  await page
    .getByLabel('Narrative Explanation')
    .fill('I used AI only for brainstorming and grammar suggestions, then wrote the final content myself.');
  await page.getByRole('button', { name: 'Submit Resolution' }).click();
  await page.waitForURL('**/dashboard?toast=resolution-submitted');

  const exportButton = page.getByRole('button', { name: 'Export Declaration' }).first();
  await expect(exportButton).toBeVisible({ timeout: 40_000 });

  const exportStart = Date.now();
  await exportButton.click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Confirm Export' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const durationMs = Date.now() - exportStart;
  expect(durationMs).toBeLessThan(120_000);

  const fs = await import('node:fs/promises');
  const fileContent = await fs.readFile(downloadPath!, 'utf-8');
  const exportedJson = JSON.parse(fileContent) as Record<string, unknown>;
  expect(exportedJson.systemSummary).toBeDefined();
  expect(exportedJson.studentRemarks).toBeDefined();
  expect(exportedJson.policyVersionNumber).toBeDefined();
  expect(exportedJson.flags).toBeDefined();
  expect(exportedJson.resolutions).toBeDefined();

  await page.evaluate(() => {
    const hasOverflow = document.documentElement.scrollWidth > window.innerWidth;
    if (hasOverflow) {
      throw new Error('Horizontal overflow detected');
    }
  });
});

test('Policy Update Notification: admin publishes and student receives + dismisses banner', async ({
  browser,
}) => {
  const adminPage = await browser.newPage();
  await login(adminPage, 'admin@ntnu.no', 'Admin User');

  await adminPage.goto('/policies');
  await adminPage.getByRole('button', { name: 'Create New Version' }).click();
  await adminPage.waitForURL('**/policies/**');

  await adminPage.getByRole('button', { name: 'Add Rule' }).click();
  const row = adminPage.locator('tbody tr').last();
  await row.locator('input').nth(0).fill('Literature Review');
  await row.locator('select').selectOption('MODERATE');
  await row.locator('input').nth(1).fill('NTNU-AI-2.1.3');
  await row.locator('input').nth(2).fill('summarise, summarize, synthesise');
  await adminPage.getByRole('button', { name: 'Save Rules' }).click();

  await adminPage.getByRole('button', { name: 'Publish Version' }).click();
  await expect(adminPage.getByText('students with active assignments will receive')).toBeVisible();
  await adminPage.getByRole('button', { name: 'Confirm Publish' }).click();
  await expect(adminPage.getByText('Status: ACTIVE')).toBeVisible({ timeout: 20_000 });
  await adminPage.close();

  const studentPage = await browser.newPage();
  await login(studentPage, 'student@ntnu.no', 'Student User');
  await studentPage.goto('/dashboard');

  const unreadBeforeResponse = await studentPage.request.get('/api/notifications');
  expect(unreadBeforeResponse.ok()).toBeTruthy();
  const unreadBefore = (await unreadBeforeResponse.json()) as {
    unreadCount: number;
  };
  expect(unreadBefore.unreadCount).toBeGreaterThan(0);

  await expect(
    studentPage.getByText(/Severity changes|New categories|No severity or category changes/),
  ).toBeVisible({ timeout: 20_000 });
  await studentPage.getByRole('button', { name: 'Dismiss' }).first().click();

  await expect
    .poll(async () => {
      const unreadAfterResponse = await studentPage.request.get('/api/notifications');
      const unreadAfter = (await unreadAfterResponse.json()) as { unreadCount: number };
      return unreadAfter.unreadCount;
    })
    .toBe(unreadBefore.unreadCount - 1);
  await studentPage.close();

  const requiredActions = [
    'USER_LOGIN',
    'LOG_CREATED',
    'COMPLIANCE_CLASSIFIED',
    'RESOLUTION_SUBMITTED',
    'DECLARATION_EXPORTED',
    'POLICY_VERSION_PUBLISHED',
  ];
  const auditRows = await prisma.auditLog.findMany({
    where: {
      actionType: { in: requiredActions },
    },
    select: { actionType: true },
  });
  const actionSet = new Set(auditRows.map((row) => row.actionType));
  for (const action of requiredActions) {
    expect(actionSet.has(action)).toBeTruthy();
  }
});
