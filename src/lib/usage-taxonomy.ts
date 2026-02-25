export const MANUAL_USAGE_TAXONOMY_VERSION = 'v1' as const;

export type UsageTreeNode = {
  id: string;
  label: string;
  children?: UsageTreeNode[];
};

export type UsageSection = {
  id: string;
  label: string;
  children: UsageTreeNode[];
};

export const MANUAL_USAGE_TAXONOMY: UsageSection[] = [
  {
    id: 'no-ai',
    label: 'No AI',
    children: [],
  },
  {
    id: 'writing',
    label: 'Writing',
    children: [
      {
        id: 'text-generation',
        label: 'Text generation',
        children: [
          { id: 'partial-text-generation', label: 'Partial text generation' },
          { id: 'full-section-generation', label: 'Full section generation' },
        ],
      },
      {
        id: 'text-improvement',
        label: 'Text improvement',
        children: [
          { id: 'text-correction', label: 'Text correction (grammar/spelling)' },
          { id: 'critique-and-quality-improvement', label: 'Critique and quality improvement' },
        ],
      },
      { id: 'summarization', label: 'Summarization' },
      { id: 'translation', label: 'Translation' },
    ],
  },
  {
    id: 'programming',
    label: 'Programming',
    children: [
      { id: 'code-explanation', label: 'Code explanation' },
      { id: 'debugging-support', label: 'Debugging support' },
      {
        id: 'code-generation',
        label: 'Code generation',
        children: [
          { id: 'partial-code-generation', label: 'Partial code generation' },
          { id: 'full-solution-generation', label: 'Full solution generation' },
          { id: 'test-generation', label: 'Test generation' },
        ],
      },
      { id: 'refactoring-suggestions', label: 'Refactoring suggestions' },
    ],
  },
  {
    id: 'research-and-ideation',
    label: 'Research and ideation',
    children: [
      { id: 'brainstorming-ideas', label: 'Brainstorming ideas' },
      { id: 'outline-generation', label: 'Outline generation' },
      { id: 'source-discovery', label: 'Source discovery' },
      { id: 'source-comparison', label: 'Source comparison' },
      { id: 'question-formulation', label: 'Question formulation' },
    ],
  },
  {
    id: 'data-and-analysis',
    label: 'Data and analysis',
    children: [
      { id: 'data-interpretation', label: 'Data interpretation' },
      { id: 'statistical-guidance', label: 'Statistical guidance' },
      { id: 'visualization-suggestions', label: 'Visualization suggestions' },
      { id: 'result-explanation', label: 'Result explanation' },
    ],
  },
  {
    id: 'presentation-and-communication',
    label: 'Presentation and communication',
    children: [
      { id: 'slide-structure', label: 'Slide structure' },
      { id: 'speaker-notes', label: 'Speaker notes' },
      { id: 'email-message-drafting', label: 'Email/message drafting' },
      { id: 'audience-adaptation', label: 'Audience adaptation' },
    ],
  },
];

export function getUsageSectionById(sectionId: string) {
  return MANUAL_USAGE_TAXONOMY.find((section) => section.id === sectionId) ?? null;
}

function findNodeById(nodes: UsageTreeNode[], targetId: string): UsageTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const nestedMatch = findNodeById(node.children, targetId);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }
  return null;
}

export function isLeafUsageNodeId(nodeId: string): boolean {
  const node = findNodeById(getUsageTreeRootNodes(), nodeId);
  if (!node) {
    return false;
  }
  return !node.children || node.children.length === 0;
}

function findPathToNode(nodes: UsageTreeNode[], targetId: string, acc: string[] = []): string[] | null {
  for (const node of nodes) {
    const nextPath = [...acc, node.label];
    if (node.id === targetId) {
      return nextPath;
    }

    if (node.children && node.children.length > 0) {
      const nested = findPathToNode(node.children, targetId, nextPath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function findPathToNodeIds(nodes: UsageTreeNode[], targetId: string, acc: string[] = []): string[] | null {
  for (const node of nodes) {
    const nextPath = [...acc, node.id];
    if (node.id === targetId) {
      return nextPath;
    }

    if (node.children && node.children.length > 0) {
      const nested = findPathToNodeIds(node.children, targetId, nextPath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

export function getUsageTreeRootNodes(): UsageTreeNode[] {
  return MANUAL_USAGE_TAXONOMY.map((section) => ({
    id: section.id,
    label: section.label,
    children: section.children,
  }));
}

export function getUsageNodeIdPath(nodeId: string): string[] {
  return findPathToNodeIds(getUsageTreeRootNodes(), nodeId) ?? [];
}

export function getDescendantLeafNodeIds(nodeId: string): string[] {
  const startNode = findNodeById(getUsageTreeRootNodes(), nodeId);
  if (!startNode) {
    return [];
  }

  const leaves: string[] = [];
  const stack: UsageTreeNode[] = [startNode];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (!current.children || current.children.length === 0) {
      leaves.push(current.id);
      continue;
    }

    stack.push(...current.children);
  }

  return leaves;
}

function findNodeByIdGlobal(nodeId: string): UsageTreeNode | null {
  return findNodeById(getUsageTreeRootNodes(), nodeId);
}

function getPathToNodeGlobal(nodeId: string): string[] | null {
  return findPathToNode(getUsageTreeRootNodes(), nodeId);
}

function getTopLevelSectionForNode(nodeId: string): UsageSection | null {
  for (const section of MANUAL_USAGE_TAXONOMY) {
    if (section.id === nodeId || findNodeById(section.children, nodeId)) {
      return section;
    }
  }
  return null;
}

export function getTopLevelSectionsForSelections(nodeIds: string[]) {
  const sectionMap = new Map<string, { id: string; label: string }>();
  for (const nodeId of nodeIds) {
    const section = getTopLevelSectionForNode(nodeId);
    if (section) {
      sectionMap.set(section.id, { id: section.id, label: section.label });
    }
  }
  return Array.from(sectionMap.values());
}

export function areValidUsageSelections(nodeIds: string[]): boolean {
  if (nodeIds.length === 0) {
    return false;
  }

  const uniqueIds = new Set(nodeIds);
  if (uniqueIds.size !== nodeIds.length) {
    return false;
  }

  return nodeIds.every((nodeId) => findNodeByIdGlobal(nodeId) !== null);
}

export function getUsageLabelsForSelections(nodeIds: string[]) {
  const subsectionLabels = nodeIds
    .map((nodeId) => getPathToNodeGlobal(nodeId))
    .filter((path): path is string[] => Boolean(path))
    .map((path) => path[path.length - 1] ?? '')
    .filter((label) => label.length > 0);

  const subsectionLabelPaths = nodeIds
    .map((nodeId) => getPathToNodeGlobal(nodeId))
    .filter((path): path is string[] => Boolean(path))
    .map((path) => path.join(' > '))
    .filter((label): label is string => Boolean(label));

  const sections = getTopLevelSectionsForSelections(nodeIds);

  return {
    sectionLabels: sections.map((section) => section.label),
    sectionIds: sections.map((section) => section.id),
    subsectionLabels,
    subsectionLabelPaths,
  };
}
