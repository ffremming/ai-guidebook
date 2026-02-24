import { type SeverityLevel } from '@prisma/client';

import type { PolicyRuleRecord } from './policy-evaluator';

export interface ContentClassificationResult {
  detectedCategory: string | null;
  ruleReferences: string[];
}

export interface ContentClassifierStrategy {
  classify(text: string, rules: PolicyRuleRecord[]): ContentClassificationResult;
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

class KeywordContentClassifier implements ContentClassifierStrategy {
  classify(text: string, rules: PolicyRuleRecord[]): ContentClassificationResult {
    const normalized = normalize(text);

    let best: { category: string; ruleReference: string; score: number } | null = null;

    for (const rule of rules) {
      let score = 0;

      for (const keyword of rule.keywords) {
        const normalizedKeyword = normalize(keyword);
        if (!normalizedKeyword) {
          continue;
        }

        if (normalized.includes(normalizedKeyword)) {
          score += 1;
        }
      }

      if (score <= 0) {
        continue;
      }

      if (!best || score > best.score) {
        best = {
          category: rule.usageCategory,
          ruleReference: rule.ruleReference,
          score,
        };
      }
    }

    if (!best) {
      return {
        detectedCategory: null,
        ruleReferences: [],
      };
    }

    return {
      detectedCategory: best.category,
      ruleReferences: [best.ruleReference],
    };
  }
}

class KeywordContentClassifierAlias extends KeywordContentClassifier {}

const CLASSIFIERS: Record<string, ContentClassifierStrategy> = {
  keyword: new KeywordContentClassifier(),
  'keyword-v1': new KeywordContentClassifierAlias(),
};

export function createContentClassifierFromEnv(): ContentClassifierStrategy {
  const strategy = (process.env.CLASSIFIER_STRATEGY ?? 'keyword').trim().toLowerCase();
  return CLASSIFIERS[strategy] ?? CLASSIFIERS.keyword;
}

export function severityRank(severity: SeverityLevel): number {
  switch (severity) {
    case 'ALLOWED':
      return 0;
    case 'MINOR':
      return 1;
    case 'MODERATE':
      return 2;
    case 'SERIOUS':
      return 3;
    case 'FORBIDDEN':
      return 4;
    default:
      return -1;
  }
}
