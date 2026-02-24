import { ComplianceStatus, SeverityLevel } from '@prisma/client';

import { prisma } from '@/lib/db/client';

import {
  createContentClassifierFromEnv,
  type ContentClassificationResult,
  type ContentClassifierStrategy,
} from './content-classifier';
import { ConflictDetector } from './conflict-detector';
import { evaluateIntentFromRules } from './intent-evaluator';

export interface PolicyRuleRecord {
  usageCategory: string;
  severityLevel: SeverityLevel;
  ruleReference: string;
  keywords: string[];
}

export interface PolicyRuleProvider {
  getRules(policyVersionId: string): Promise<PolicyRuleRecord[]>;
}

class PrismaPolicyRuleProvider implements PolicyRuleProvider {
  async getRules(policyVersionId: string): Promise<PolicyRuleRecord[]> {
    return prisma.policyRule.findMany({
      where: { policyVersionId },
      select: {
        usageCategory: true,
        severityLevel: true,
        ruleReference: true,
        keywords: true,
      },
    });
  }
}

export interface EvaluateIntentResult {
  detectedCategory: string | null;
  complianceStatus: ComplianceStatus;
  severityLevel: SeverityLevel | null;
  ruleReferences: string[];
  message: string;
}

export interface EvaluatePostSessionInput {
  logId: string;
  sessionText: string;
  policyVersionId: string;
  intentCategory?: string | null;
}

export interface EvaluatePostSessionResult {
  logId: string;
  intentCategory: string | null;
  actualCategory: string | null;
  complianceStatus: ComplianceStatus;
  conflictFlag: boolean;
  directViolationFlag: boolean;
  flagSeverity: SeverityLevel | null;
  ruleReferences: string[];
  message: string;
}

export class PolicyEvaluatorService {
  private readonly ruleProvider: PolicyRuleProvider;

  private readonly classifier: ContentClassifierStrategy;

  private readonly conflictDetector: ConflictDetector;

  constructor(options?: {
    ruleProvider?: PolicyRuleProvider;
    classifier?: ContentClassifierStrategy;
  }) {
    this.ruleProvider = options?.ruleProvider ?? new PrismaPolicyRuleProvider();
    this.classifier = options?.classifier ?? createContentClassifierFromEnv();
    this.conflictDetector = new ConflictDetector(this.ruleProvider);
  }

  async evaluateIntent(reason: string, policyVersionId: string): Promise<EvaluateIntentResult> {
    const rules = await this.ruleProvider.getRules(policyVersionId);
    return evaluateIntentFromRules(reason, rules);
  }

  async evaluatePostSession(
    input: EvaluatePostSessionInput,
  ): Promise<EvaluatePostSessionResult> {
    const rules = await this.ruleProvider.getRules(input.policyVersionId);
    const classification: ContentClassificationResult = this.classifier.classify(
      input.sessionText,
      rules,
    );

    const conflict = await this.conflictDetector.detect(
      input.intentCategory ?? null,
      classification.detectedCategory,
      input.policyVersionId,
    );

    const complianceStatus = (() => {
      if (conflict.directViolationFlag || conflict.conflictFlag) {
        return ComplianceStatus.NON_COMPLIANT;
      }

      if (classification.detectedCategory === null) {
        return ComplianceStatus.WARNING;
      }

      return ComplianceStatus.COMPLIANT;
    })();

    const message = classification.detectedCategory
      ? `Post-session category classified as ${classification.detectedCategory}`
      : 'Could not classify post-session content';

    return {
      logId: input.logId,
      intentCategory: input.intentCategory ?? null,
      actualCategory: classification.detectedCategory,
      complianceStatus,
      conflictFlag: conflict.conflictFlag,
      directViolationFlag: conflict.directViolationFlag,
      flagSeverity: conflict.flagSeverity,
      ruleReferences: conflict.ruleReferences,
      message,
    };
  }
}

export const PolicyEvaluator = new PolicyEvaluatorService();
