import { FlatNode } from '../shared/types';
import { buildFlatNodes } from './parser';

export function computeStructuralDiff(
  primaryData: any,
  secondaryData: any
): { diffNodes: FlatNode[]; stats: { added: number; removed: number; modified: number } } {
  const stats = { added: 0, removed: 0, modified: 0 };

  const primaryFlat = buildFlatNodes(primaryData, 100);
  const secondaryFlat = buildFlatNodes(secondaryData, 100);

  const primaryMap = new Map<string, FlatNode>();
  primaryFlat.forEach((n) => primaryMap.set(n.path, n));

  const secondaryMap = new Map<string, FlatNode>();
  secondaryFlat.forEach((n) => secondaryMap.set(n.path, n));

  const diffNodes: FlatNode[] = [];

  // Traverse primary nodes
  primaryFlat.forEach((pNode) => {
    const sNode = secondaryMap.get(pNode.path);

    if (!sNode) {
      // Node exists in primary but removed in secondary
      stats.removed++;
      diffNodes.push({
        ...pNode,
        diffStatus: 'removed'
      });
    } else {
      // Both exist, check if modified
      const pVal = pNode.hasChildren ? pNode.childCount : JSON.stringify(pNode.value);
      const sVal = sNode.hasChildren ? sNode.childCount : JSON.stringify(sNode.value);

      if (pVal !== sVal) {
        stats.modified++;
        diffNodes.push({
          ...pNode,
          diffStatus: 'modified',
          oldValue: sNode.value
        });
      } else {
        diffNodes.push({
          ...pNode,
          diffStatus: 'unchanged'
        });
      }
    }
  });

  // Traverse secondary nodes to find newly added items
  secondaryFlat.forEach((sNode) => {
    if (!primaryMap.has(sNode.path)) {
      stats.added++;
      diffNodes.push({
        ...sNode,
        diffStatus: 'added'
      });
    }
  });

  return { diffNodes, stats };
}
