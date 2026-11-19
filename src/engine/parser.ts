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

export function formatJsonPathSegment(seg: PathSegment): string {
  if (seg.type === 'index') return `[${seg.key}]`;
  const k = String(seg.key);
  return /^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`;
}

export interface JsonToken {
  type: 'punct' | 'string' | 'literal';
  value: string;
}

export function tokenizeJsonText(raw: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const ch = raw[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',') {
      tokens.push({ type: 'punct', value: ch });
      i++;
      continue;
    }
    if (ch === '"') {
      let end = i + 1;
      while (end < n) {
        if (raw[end] === '\\') {
          end += 2;
        } else if (raw[end] === '"') {
          end++;
          break;
        } else {
          end++;
        }
      }
      tokens.push({ type: 'string', value: raw.slice(i, end) });
      i = end;
      continue;
    }
    let end = i;
    while (end < n && !' \t\r\n{}[]:,'.includes(raw[end])) {
      end++;
    }
    tokens.push({ type: 'literal', value: raw.slice(i, end) });
    i = end;
  }
  return tokens;
}

export function formatJsonPreservingNumbers(rawText: string, indentSpaces: number = 2): string {
  const indentUnit = ' '.repeat(indentSpaces);
  const tokens = tokenizeJsonText(rawText);
  const out: string[] = [];
  let depth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];

    if (tok.type === 'punct') {
      if (tok.value === '{' || tok.value === '[') {
        if (next && next.type === 'punct' && ((tok.value === '{' && next.value === '}') || (tok.value === '[' && next.value === ']'))) {
          out.push(tok.value + next.value);
          i++;
        } else {
          depth++;
          out.push(tok.value + '\n' + indentUnit.repeat(depth));
        }
      } else if (tok.value === '}' || tok.value === ']') {
        depth = Math.max(0, depth - 1);
        out.push('\n' + indentUnit.repeat(depth) + tok.value);
      } else if (tok.value === ':') {
        out.push(': ');
      } else if (tok.value === ',') {
        out.push(',\n' + indentUnit.repeat(depth));
      }
    } else {
      out.push(tok.value);
    }
  }
  return out.join('');
}

export function minifyJsonPreservingNumbers(rawText: string): string {
  return tokenizeJsonText(rawText).map((t) => t.value).join('');
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
    
    // Construct canonical collision-free node ID and JSONPath
    let currentId = '$';
    let path = '$';

    if (pathSegments.length > 0) {
      path = `$${pathSegments.map(formatJsonPathSegment).join('')}`;
      currentId = path;
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
          const childIndex = result.length;
          
          traverse(item, idx, currentId, depth + 1, [...pathSegments, seg]);
          
          if (isAnomaly && result[childIndex]) {
            result[childIndex].smart = {
              type: 'schema_anomaly',
              raw: 'Schema Anomaly',
              badge: 'ANOMALY',
              formatted: '⚠️ Inconsistent key schema compared to other items in this array'
            };
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
