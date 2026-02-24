import { ComplianceStatus, SeverityLevel } from '@prisma/client';

import type { PolicyRuleRecord } from './policy-evaluator';

export interface IntentEvaluationResult {
  detectedCategory: string | null;
  complianceStatus: ComplianceStatus;
  severityLevel: SeverityLevel | null;
  ruleReferences: string[];
  message: string;
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function scoreRuleMatch(text: string, rule: PolicyRuleRecord): number {
  const normalized = normalize(text);

  let score = 0;
  for (const keyword of rule.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword.length > 0 && normalized.includes(normalizedKeyword)) {
      score += 1;
    }
  }

  return score;
}

function severityToComplianceStatus(severity: SeverityLevel): ComplianceStatus {
  if (severity === SeverityLevel.FORBIDDEN || severity === SeverityLevel.SERIOUS) {
    return ComplianceStatus.NON_COMPLIANT;
  }

  if (severity === SeverityLevel.MODERATE) {
    return ComplianceStatus.WARNING;
  }

  return ComplianceStatus.COMPLIANT;
}

export function evaluateIntentFromRules(
  reason: string,
  rules: PolicyRuleRecord[],
): IntentEvaluationResult {
  let best: { rule: PolicyRuleRecord; score: number } | null = null;

  for (const rule of rules) {
    const score = scoreRuleMatch(reason, rule);
    if (score <= 0) {
      continue;
    }

    if (!best || score > best.score) {
      best = { rule, score };
    }
  }

  if (!best) {
    return {
      detectedCategory: null,
      complianceStatus: ComplianceStatus.WARNING,
      severityLevel: null,
      ruleReferences: [],
      message: 'Could not determine usage category — please be more specific',
    };
  }

  return {
    detectedCategory: best.rule.usageCategory,
    complianceStatus: severityToComplianceStatus(best.rule.severityLevel),
    severityLevel: best.rule.severityLevel,
    ruleReferences: [best.rule.ruleReference],
    message: `Detected category: ${best.rule.usageCategory}`,
  };
}
