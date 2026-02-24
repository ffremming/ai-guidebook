import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SeverityLevel } from '@prisma/client';

import { ConflictDetector } from '../../src/lib/compliance/conflict-detector';
import {
  type PolicyRuleProvider,
  type PolicyRuleRecord,
  PolicyEvaluatorService,
} from '../../src/lib/compliance/policy-evaluator';

const POLICY_VERSION_ID = 'policy-v-test';

const fixtureRules: PolicyRuleRecord[] = [
  {
    usageCategory: 'Grammar Fix',
    severityLevel: SeverityLevel.ALLOWED,
    ruleReference: 'NTNU-AIP-1.1',
    keywords: ['grammar', 'proofread', 'spelling'],
  },
  {
    usageCategory: 'Code Debugging',
    severityLevel: SeverityLevel.MINOR,
    ruleReference: 'NTNU-AIP-1.2',
    keywords: ['debug', 'traceback', 'stack trace'],
  },
  {
    usageCategory: 'Code Generation',
    severityLevel: SeverityLevel.MODERATE,
    ruleReference: 'NTNU-AIP-1.3',
    keywords: ['generate code', 'implement function', 'scaffold'],
  },
  {
    usageCategory: 'Brainstorming',
    severityLevel: SeverityLevel.ALLOWED,
    ruleReference: 'NTNU-AIP-1.4',
    keywords: ['brainstorm', 'ideas', 'outline'],
  },
  {
    usageCategory: 'Full Text Generation',
    severityLevel: SeverityLevel.FORBIDDEN,
    ruleReference: 'NTNU-AIP-1.5',
    keywords: ['write my entire essay', 'full text', 'complete report'],
  },
];

class FixtureRuleProvider implements PolicyRuleProvider {
  async getRules(_policyVersionId: string): Promise<PolicyRuleRecord[]> {
    return fixtureRules;
  }
}

describe('PolicyEvaluator.evaluateIntent', () => {
  const evaluator = new PolicyEvaluatorService({
    ruleProvider: new FixtureRuleProvider(),
  });

  test('detects category for five different reason strings', async () => {
    const cases = [
      {
        reason: 'I need help fixing grammar in my essay.',
        expectedCategory: 'Grammar Fix',
      },
      {
        reason: 'Can you debug this traceback from my Python script?',
        expectedCategory: 'Code Debugging',
      },
      {
        reason: 'Please generate code for an API scaffold.',
        expectedCategory: 'Code Generation',
      },
      {
        reason: 'Help me brainstorm ideas for the report structure.',
        expectedCategory: 'Brainstorming',
      },
      {
        reason: 'Write my entire essay so I can submit it.',
        expectedCategory: 'Full Text Generation',
      },
    ];

    for (const testCase of cases) {
      const result = await evaluator.evaluateIntent(testCase.reason, POLICY_VERSION_ID);
      assert.equal(result.detectedCategory, testCase.expectedCategory);
      assert.ok(result.ruleReferences.length > 0);
    }
  });

  test('returns NON_COMPLIANT for FORBIDDEN category', async () => {
    const result = await evaluator.evaluateIntent(
      'Please write my entire essay and produce the full text.',
      POLICY_VERSION_ID,
    );

    assert.equal(result.detectedCategory, 'Full Text Generation');
    assert.equal(result.complianceStatus, 'NON_COMPLIANT');
  });

  test('returns warning when no keyword matches', async () => {
    const result = await evaluator.evaluateIntent(
      'I used an AI tool but this statement has no known category markers.',
      POLICY_VERSION_ID,
    );

    assert.equal(result.detectedCategory, null);
    assert.equal(result.complianceStatus, 'WARNING');
    assert.equal(
      result.message,
      'Could not determine usage category — please be more specific',
    );
  });
});

describe('ConflictDetector.detect', () => {
  const detector = new ConflictDetector(new FixtureRuleProvider());

  test('flags conflict when actual severity is higher than intent severity', async () => {
    const result = await detector.detect(
      'Grammar Fix',
      'Code Generation',
      POLICY_VERSION_ID,
    );

    assert.equal(result.conflictFlag, true);
    assert.equal(result.directViolationFlag, false);
    assert.equal(result.flagSeverity, 'MODERATE');
  });

  test('does not flag conflict when actual severity is lower than intent severity', async () => {
    const result = await detector.detect(
      'Code Generation',
      'Grammar Fix',
      POLICY_VERSION_ID,
    );

    assert.equal(result.conflictFlag, false);
    assert.equal(result.directViolationFlag, false);
    assert.equal(result.flagSeverity, 'ALLOWED');
  });

  test('sets directViolationFlag for forbidden actual category', async () => {
    const result = await detector.detect(
      'Grammar Fix',
      'Full Text Generation',
      POLICY_VERSION_ID,
    );

    assert.equal(result.conflictFlag, true);
    assert.equal(result.directViolationFlag, true);
    assert.equal(result.flagSeverity, 'FORBIDDEN');
  });
});
