import { prisma } from '@/lib/db/client';
import {
  getDescendantLeafNodeIds,
  getUsageNodeIdPath,
  isLeafUsageNodeId,
} from '@/lib/usage-taxonomy';

const BASELINE_DISALLOWED_NODE_IDS = [
  'full-section-generation',
  'full-solution-generation',
] as const;

function getBaselineRuleMap(): Map<string, boolean> {
  return new Map(
    BASELINE_DISALLOWED_NODE_IDS.map((nodeId) => [nodeId, false]),
  );
}

export async function getCourseUsageRuleMap(courseId: string): Promise<Map<string, boolean>> {
  const courseUsageRuleDelegate = (prisma as unknown as {
    courseUsageRule?: {
      findMany: (args: {
        where: { courseId: string };
        select: { nodeId: true; isAllowed: true };
      }) => Promise<Array<{ nodeId: string; isAllowed: boolean }>>;
    };
  }).courseUsageRule;

  if (!courseUsageRuleDelegate) {
    return getBaselineRuleMap();
  }

  const courseRules = await courseUsageRuleDelegate
    .findMany({
      where: { courseId },
      select: {
        nodeId: true,
        isAllowed: true,
      },
    })
    .catch((error: unknown) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        ((error as { code?: string }).code === 'P2021' ||
          (error as { code?: string }).code === 'P2022')
      ) {
        return [];
      }
      throw error;
    });

  const merged = getBaselineRuleMap();
  for (const rule of courseRules) {
    merged.set(rule.nodeId, rule.isAllowed);
  }

  return merged;
}

export function isUsageNodeAllowedByRules(
  nodeId: string,
  ruleMap: Map<string, boolean>,
): boolean {
  const nodePath = getUsageNodeIdPath(nodeId);
  if (nodePath.length === 0) {
    return true;
  }

  for (const pathNodeId of nodePath) {
    if (ruleMap.get(pathNodeId) === false) {
      return false;
    }
  }

  return true;
}

export function findDisallowedUsageSelections(
  nodeIds: string[],
  ruleMap: Map<string, boolean>,
): string[] {
  return nodeIds.filter((nodeId) => !isUsageNodeAllowedByRules(nodeId, ruleMap));
}

export function findWarningParentSelections(
  nodeIds: string[],
  ruleMap: Map<string, boolean>,
): string[] {
  return nodeIds.filter((nodeId) => {
    if (isLeafUsageNodeId(nodeId)) {
      return false;
    }

    const descendantLeafNodeIds = getDescendantLeafNodeIds(nodeId);
    if (descendantLeafNodeIds.length === 0) {
      return false;
    }

    return descendantLeafNodeIds.some(
      (leafNodeId) => !isUsageNodeAllowedByRules(leafNodeId, ruleMap),
    );
  });
}
