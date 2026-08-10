import { FlatNode, NodeType, PathSegment } from '../shared/types';
import { detectSchemaAnomalies, detectSmartValue } from './smart-detector';

export function getNodeType(value: any): NodeType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'object') return 'object';
  if (type === 'string') return 'string';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
}

export function parseJson(raw: string): any {
  // First attempt native standard parse
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Relaxed JSON repair attempt (strip trailing commas, resolve single quotes)
    try {
      const repaired = raw
        .replace(/,\s*([\]}])/g, '$1') // Trailing commas
        .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"'); // Single quotes to double quotes
      return JSON.parse(repaired);
    } catch {
      throw new Error(`Invalid JSON syntax: ${(err as Error).message}`);
    }
  }
}

/**
 * Builds a flattened list of tree nodes from a JSON data structure.
 * Supports default expand depth and lazy expanding.
 */
export function buildFlatNodes(
  data: any,
  defaultExpandDepth: number = 2,
  expandedStateMap: Map<string, boolean> = new Map()
): FlatNode[] {
  const result: FlatNode[] = [];

  function traverse(
    value: any,
    key: string | number | null,
    parentId: string | null,
    depth: number,
    pathSegments: PathSegment[]
  ) {
    const type = getNodeType(value);
    const hasChildren = type === 'object' || type === 'array';
    
    // Construct unique node ID and JSONPath
    let currentId = 'root';
    let path = '$';

    if (pathSegments.length > 0) {
      const segParts = pathSegments.map((seg) =>
        seg.type === 'index' ? `[${seg.key}]` : `.${seg.key}`
      );
      path = `$${segParts.join('')}`;
      currentId = pathSegments.map((s) => s.key).join('.');
    }

    let childCount = 0;
    if (type === 'array') childCount = value.length;
    else if (type === 'object' && value !== null) childCount = Object.keys(value).length;

    // Check expand state preference (explicit user state overrides default depth)
    let isExpanded = depth <= defaultExpandDepth;
    if (expandedStateMap.has(currentId)) {
      isExpanded = expandedStateMap.get(currentId)!;
    }

    const smart = !hasChildren ? detectSmartValue(value) : null;

    const node: FlatNode = {
      id: currentId,
      depth,
      key,
      value: hasChildren ? (type === 'array' ? `[ ${childCount} items ]` : `{ ${childCount} items }`) : value,
      type,
      path,
      pathSegments,
      isExpanded: hasChildren ? isExpanded : false,
      hasChildren,
      childCount,
      parentId,
      smart
    };

    result.push(node);

    // If node is expanded and has children, traverse children
    if (hasChildren && isExpanded) {
      if (type === 'array') {
        const anomalies = detectSchemaAnomalies(value);
        value.forEach((item: any, idx: number) => {
          const seg: PathSegment = { key: idx, type: 'index' };
          const isAnomaly = anomalies.has(idx);
          
          traverse(item, idx, currentId, depth + 1, [...pathSegments, seg]);
          
          if (isAnomaly) {
            // Attach anomaly flag to child root
            const childNodeId = [...pathSegments, seg].map((s) => s.key).join('.');
            const childNode = result.find((n) => n.id === childNodeId);
            if (childNode) {
              childNode.smart = {
                type: 'schema_anomaly',
                raw: 'Schema Anomaly',
                badge: 'ANOMALY',
                formatted: '⚠️ Inconsistent key schema compared to other items in this array'
              };
            }
          }
        });
      } else if (type === 'object' && value !== null) {
        Object.keys(value).forEach((k) => {
          const seg: PathSegment = { key: k, type: 'property' };
          traverse(value[k], k, currentId, depth + 1, [...pathSegments, seg]);
        });
      }
    }
  }

  traverse(data, null, null, 1, []);
  return result;
}
