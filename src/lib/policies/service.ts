import { PolicyStatus, SeverityLevel } from '@prisma/client';

import { prisma } from '@/lib/db/client';

export interface CreatePolicyRuleInput {
  usageCategory: string;
  severityLevel: SeverityLevel;
  description?: string | null;
  ruleReference: string;
  keywords: string[];
}

export interface CreatePolicyVersionInput {
  versionNumber: string;
  description?: string | null;
  rules: CreatePolicyRuleInput[];
}

function normalizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isSeverityLevel(input: unknown): input is SeverityLevel {
  return (
    input === SeverityLevel.ALLOWED ||
    input === SeverityLevel.MINOR ||
    input === SeverityLevel.MODERATE ||
    input === SeverityLevel.SERIOUS ||
    input === SeverityLevel.FORBIDDEN
  );
}

export function parseCreatePolicyBody(body: unknown): CreatePolicyVersionInput | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const raw = body as Record<string, unknown>;
  const versionNumber =
    typeof raw.versionNumber === 'string' ? raw.versionNumber.trim() : '';
  const description =
    typeof raw.description === 'string' ? raw.description.trim() : null;
  const rawRules = Array.isArray(raw.rules) ? raw.rules : [];

  if (!versionNumber) {
    return null;
  }

  const rules: CreatePolicyRuleInput[] = [];
  const seenCategories = new Set<string>();

  for (const rawRule of rawRules) {
    if (!rawRule || typeof rawRule !== 'object') {
      return null;
    }

    const rule = rawRule as Record<string, unknown>;
    const usageCategory =
      typeof rule.usageCategory === 'string' ? rule.usageCategory.trim() : '';
    const ruleReference =
      typeof rule.ruleReference === 'string' ? rule.ruleReference.trim() : '';
    const severityLevel = rule.severityLevel;
    const ruleDescription =
      typeof rule.description === 'string' ? rule.description.trim() : null;
    const keywords = normalizeKeywords(rule.keywords);

    if (!usageCategory || !ruleReference || !isSeverityLevel(severityLevel)) {
      return null;
    }

    const normalizedCategory = usageCategory.toLowerCase();
    if (seenCategories.has(normalizedCategory)) {
      return null;
    }
    seenCategories.add(normalizedCategory);

    rules.push({
      usageCategory,
      severityLevel,
      description: ruleDescription,
      ruleReference,
      keywords,
    });
  }

  return {
    versionNumber,
    description,
    rules,
  };
}

function formatSeverityDiff(oldSeverity: SeverityLevel, newSeverity: SeverityLevel): string {
  return `${oldSeverity} -> ${newSeverity}`;
}

export function buildPolicyChangeSummary(
  oldRules: Array<{ usageCategory: string; severityLevel: SeverityLevel }>,
  newRules: Array<{ usageCategory: string; severityLevel: SeverityLevel }>,
): string {
  const oldMap = new Map<string, SeverityLevel>();
  for (const rule of oldRules) {
    oldMap.set(rule.usageCategory, rule.severityLevel);
  }

  const changedSeverity: string[] = [];
  const newCategories: string[] = [];

  for (const rule of newRules) {
    const previous = oldMap.get(rule.usageCategory);
    if (!previous) {
      newCategories.push(rule.usageCategory);
      continue;
    }

    if (previous !== rule.severityLevel) {
      changedSeverity.push(
        `${rule.usageCategory} (${formatSeverityDiff(previous, rule.severityLevel)})`,
      );
    }
  }

  if (changedSeverity.length === 0 && newCategories.length === 0) {
    return 'No severity or category changes detected.';
  }

  const parts: string[] = [];
  if (changedSeverity.length > 0) {
    parts.push(`Severity changes: ${changedSeverity.join('; ')}`);
  }
  if (newCategories.length > 0) {
    parts.push(`New categories: ${newCategories.join(', ')}`);
  }

  return parts.join(' | ');
}

export async function createDraftPolicyVersion(input: CreatePolicyVersionInput) {
  return prisma.policyVersion.create({
    data: {
      versionNumber: input.versionNumber,
      description: input.description,
      status: PolicyStatus.DRAFT,
      rules: {
        create: input.rules.map((rule) => ({
          usageCategory: rule.usageCategory,
          severityLevel: rule.severityLevel,
          description: rule.description,
          ruleReference: rule.ruleReference,
          keywords: rule.keywords,
        })),
      },
    },
    select: {
      id: true,
      status: true,
    },
  });
}
