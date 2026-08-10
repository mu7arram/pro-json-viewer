import { FlatNode, FilterMode } from '../shared/types';

export interface SearchMatch {
  nodeId: string;
  matchedKey?: boolean;
  matchedValue?: boolean;
}

export function searchTree(
  nodes: FlatNode[],
  query: string,
  mode: FilterMode = 'text'
): { matchedIds: Set<string>; expandAncestorIds: Set<string> } {
  const matchedIds = new Set<string>();
  const expandAncestorIds = new Set<string>();

  if (!query.trim()) {
    return { matchedIds, expandAncestorIds };
  }

  const trimmed = query.trim();

  if (mode === 'jsonpath') {
    // JSONPath evaluation: matching nodes whose JSONPath or path string matches
    const pathLower = trimmed.toLowerCase();
    nodes.forEach((node) => {
      if (node.path.toLowerCase().includes(pathLower)) {
        matchedIds.add(node.id);
        markAncestors(node, nodes, expandAncestorIds);
      }
    });
    return { matchedIds, expandAncestorIds };
  }

  let regex: RegExp | null = null;
  if (mode === 'regex') {
    try {
      regex = new RegExp(trimmed, 'i');
    } catch {
      // Invalid regex pattern, return empty match set
      return { matchedIds, expandAncestorIds };
    }
  }

  const queryLower = trimmed.toLowerCase();

  nodes.forEach((node) => {
    let matchKey = false;
    let matchVal = false;

    // Key match
    if (node.key !== null) {
      const keyStr = String(node.key);
      if (regex) matchKey = regex.test(keyStr);
      else matchKey = keyStr.toLowerCase().includes(queryLower);
    }

    // Value match (only for leaf primitive nodes)
    if (!node.hasChildren && node.value !== null && node.value !== undefined) {
      const valStr = typeof node.value === 'object' ? JSON.stringify(node.value) : String(node.value);
      if (regex) matchVal = regex.test(valStr);
      else matchVal = valStr.toLowerCase().includes(queryLower);
    }

    if (matchKey || matchVal) {
      matchedIds.add(node.id);
      markAncestors(node, nodes, expandAncestorIds);
    }
  });

  return { matchedIds, expandAncestorIds };
}

function markAncestors(
  node: FlatNode,
  allNodes: FlatNode[],
  ancestorIds: Set<string>
) {
  let currentParentId = node.parentId;

  while (currentParentId) {
    ancestorIds.add(currentParentId);
    const parentNode = allNodes.find((n) => n.id === currentParentId);
    if (parentNode) {
      currentParentId = parentNode.parentId;
    } else {
      break;
    }
  }
}
