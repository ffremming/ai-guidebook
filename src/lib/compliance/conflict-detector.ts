import { SeverityLevel } from '@prisma/client';

import { severityRank } from './content-classifier';
import type { PolicyRuleProvider } from './policy-evaluator';

export interface ConflictDetectionResult {
  conflictFlag: boolean;
  directViolationFlag: boolean;
  flagSeverity: SeverityLevel | null;
  ruleReferences: string[];
}

export class ConflictDetector {
  private readonly ruleProvider: PolicyRuleProvider;

  constructor(ruleProvider: PolicyRuleProvider) {
    this.ruleProvider = ruleProvider;
  }

  async detect(
    intentCategory: string | null,
    actualCategory: string | null,
    policyVersionId: string,
  ): Promise<ConflictDetectionResult> {
    const rules = await this.ruleProvider.getRules(policyVersionId);

    const actualRule = actualCategory
      ? rules.find((rule) => rule.usageCategory === actualCategory)
      : null;
    const intentRule = intentCategory
      ? rules.find((rule) => rule.usageCategory === intentCategory)
      : null;

    const actualSeverity = actualRule?.severityLevel ?? null;
    const intentSeverity = intentRule?.severityLevel ?? null;

    const conflictFlag =
      Boolean(actualCategory && intentCategory) &&
      actualCategory !== intentCategory &&
      actualSeverity !== null &&
      intentSeverity !== null &&
      severityRank(actualSeverity) > severityRank(intentSeverity);

    const directViolationFlag =
      actualSeverity === SeverityLevel.SERIOUS || actualSeverity === SeverityLevel.FORBIDDEN;

    const ruleReferences = [actualRule?.ruleReference, intentRule?.ruleReference].filter(
      (value): value is string => Boolean(value),
    );

    return {
      conflictFlag,
      directViolationFlag,
      flagSeverity: actualSeverity,
      ruleReferences: Array.from(new Set(ruleReferences)),
    };
  }
}
