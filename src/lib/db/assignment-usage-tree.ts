import { EnrollmentRole } from '@prisma/client';

import { prisma } from '@/lib/db/client';
import { getCourseUsageRuleMap } from '@/lib/db/course-usage-rules';
import type { UsageTreeNode } from '@/lib/usage-taxonomy';
import { MANUAL_USAGE_TAXONOMY, getUsageTreeRootNodes } from '@/lib/usage-taxonomy';

export type UsageNodeStatus = 'ALLOWED' | 'DISALLOWED' | 'MIXED';

export type AssignmentUsageTreeNode = UsageTreeNode & {
  status: UsageNodeStatus;
  children?: AssignmentUsageTreeNode[];
};

type AssignmentContext = {
  id: string;
  title: string;
  course: {
    id: string;
    courseCode: string;
    name: string;
  };
};

function isLeaf(node: UsageTreeNode): boolean {
  return !node.children || node.children.length === 0;
}

function computeStatus(children: UsageNodeStatus[]): UsageNodeStatus {
  if (children.every((value) => value === 'ALLOWED')) {
    return 'ALLOWED';
  }
  if (children.every((value) => value === 'DISALLOWED')) {
    return 'DISALLOWED';
  }
  return 'MIXED';
}

function annotateTree(
  nodes: UsageTreeNode[],
  ruleMap: Map<string, boolean>,
  inheritedDisallowed = false,
): AssignmentUsageTreeNode[] {
  return nodes.map((node) => {
    const explicitRule = ruleMap.get(node.id);
    const isNodeDisallowed = inheritedDisallowed || explicitRule === false;

    if (isLeaf(node)) {
      return {
        id: node.id,
        label: node.label,
        status: isNodeDisallowed ? 'DISALLOWED' : 'ALLOWED',
      };
    }

    const annotatedChildren = annotateTree(node.children ?? [], ruleMap, isNodeDisallowed);
    const status = isNodeDisallowed
      ? 'DISALLOWED'
      : computeStatus(annotatedChildren.map((child) => child.status));

    return {
      id: node.id,
      label: node.label,
      status,
      children: annotatedChildren,
    };
  });
}

export async function getStudentAssignmentUsageTree(
  userId: string,
  assignmentId: string,
): Promise<{ assignment: AssignmentContext; tree: AssignmentUsageTreeNode[] } | null> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      title: true,
      course: {
        select: {
          id: true,
          courseCode: true,
          name: true,
          enrollments: {
            where: {
              userId,
              role: EnrollmentRole.STUDENT,
            },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!assignment || assignment.course.enrollments.length === 0) {
    return null;
  }

  const ruleMap = await getCourseUsageRuleMap(assignment.course.id);

  const tree = annotateTree(getUsageTreeRootNodes(), ruleMap);

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      course: {
        id: assignment.course.id,
        courseCode: assignment.course.courseCode,
        name: assignment.course.name,
      },
    },
    tree,
  };
}

export const assignmentUsageTaxonomyVersion = MANUAL_USAGE_TAXONOMY.length > 0 ? 'v1' : 'v1';
