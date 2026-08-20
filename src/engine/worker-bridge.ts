import { ParseProgressPayload, ParseWorkerResult } from '../shared/types';
import { buildFlatNodes, parseJson } from './parser';
import { analyzePayloadStats } from './schema-generator';

// Inlined Web Worker script string for maximum compatibility across content script and options page
const WORKER_CODE = `
  self.onmessage = function(e) {
    const data = e.data;
    const type = data.type;
    const startTime = performance.now();

    if (type === 'PARSE_PAYLOAD') {
      const rawText = data.rawText;
      const defaultExpandDepth = data.defaultExpandDepth || 2;
      const totalBytes = rawText.length;

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          stage: 'Deserializing JSON structure...',
          percent: 25,
          bytesProcessed: Math.floor(totalBytes * 0.25),
          totalBytes: totalBytes,
          elapsedMs: Math.round(performance.now() - startTime)
        }
      });

      let jsonObject;
      try {
        jsonObject = JSON.parse(rawText);
      } catch (err) {
        try {
          const repaired = rawText
            .replace(/,\\s*([\\]}])/g, '$1')
            .replace(/'([^'\\\\]*(\\\\.[^'\\\\]*)*)'/g, '"$1"');
          jsonObject = JSON.parse(repaired);
        } catch (repairErr) {
          self.postMessage({
            type: 'ERROR',
            error: 'Invalid JSON syntax: ' + err.message
          });
          return;
        }
      }

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          stage: 'Analyzing hierarchy and payload metrics...',
          percent: 60,
          bytesProcessed: Math.floor(totalBytes * 0.6),
          totalBytes: totalBytes,
          elapsedMs: Math.round(performance.now() - startTime)
        }
      });

      // Calculate payload metrics
      let totalKeys = 0;
      let maxDepth = 1;
      let totalObjects = 0;
      let totalArrays = 0;

      function analyze(obj, depth) {
        if (depth > maxDepth) maxDepth = depth;
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          totalArrays++;
          for (let i = 0; i < obj.length; i++) {
            analyze(obj[i], depth + 1);
          }
        } else {
          totalObjects++;
          const keys = Object.keys(obj);
          totalKeys += keys.length;
          for (let i = 0; i < keys.length; i++) {
            analyze(obj[keys[i]], depth + 1);
          }
        }
      }

      analyze(jsonObject, 1);

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          stage: 'Building virtual tree viewport...',
          percent: 85,
          bytesProcessed: Math.floor(totalBytes * 0.85),
          totalBytes: totalBytes,
          elapsedMs: Math.round(performance.now() - startTime)
        }
      });

      // Build flat nodes
      const flatNodes = [];
      const expandedStateMap = new Map(data.expandedEntries || []);

      function getNodeType(val) {
        if (val === null) return 'null';
        if (Array.isArray(val)) return 'array';
        const t = typeof val;
        if (t === 'object') return 'object';
        if (t === 'string') return 'string';
        if (t === 'number') return 'number';
        if (t === 'boolean') return 'boolean';
        return 'string';
      }

      function detectSmart(val) {
        if (typeof val === 'string') {
          if (/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/.test(val)) {
            return { type: 'date', raw: val, formatted: new Date(val).toLocaleString(), badge: '📅 Date' };
          }
          if (val.startsWith('http://') || val.startsWith('https://')) {
            return { type: 'url', raw: val, badge: '🔗 URL' };
          }
          if (/^[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+$/.test(val) && val.length > 24) {
            return { type: 'jwt', raw: val, badge: '🔑 JWT' };
          }
        }
        return null;
      }

      function traverse(val, key, parentId, depth, pathSegments) {
        const type = getNodeType(val);
        const hasChildren = type === 'object' || type === 'array';

        let currentId = 'root';
        let path = '$';

        if (pathSegments.length > 0) {
          const segParts = pathSegments.map(s => s.type === 'index' ? '[' + s.key + ']' : '.' + s.key);
          path = '$' + segParts.join('');
          currentId = pathSegments.map(s => s.key).join('.');
        }

        let childCount = 0;
        if (type === 'array') childCount = val.length;
        else if (type === 'object' && val !== null) childCount = Object.keys(val).length;

        let isExpanded = depth <= defaultExpandDepth;
        if (expandedStateMap.has(currentId)) {
          isExpanded = expandedStateMap.get(currentId);
        }

        const smart = !hasChildren ? detectSmart(val) : null;

        const node = {
          id: currentId,
          depth: depth,
          key: key,
          value: hasChildren ? (type === 'array' ? '[ ' + childCount + ' items ]' : '{ ' + childCount + ' items }') : val,
          type: type,
          path: path,
          pathSegments: pathSegments,
          isExpanded: hasChildren ? isExpanded : false,
          hasChildren: hasChildren,
          childCount: childCount,
          parentId: parentId,
          smart: smart
        };

        flatNodes.push(node);

        if (hasChildren && isExpanded) {
          if (type === 'array') {
            for (let idx = 0; idx < val.length; idx++) {
              traverse(val[idx], idx, currentId, depth + 1, pathSegments.concat({ key: idx, type: 'index' }));
            }
          } else if (type === 'object' && val !== null) {
            const keys = Object.keys(val);
            for (let i = 0; i < keys.length; i++) {
              const k = keys[i];
              traverse(val[k], k, currentId, depth + 1, pathSegments.concat({ key: k, type: 'property' }));
            }
          }
        }
      }

      traverse(jsonObject, null, null, 1, []);

      function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }

      const parseTimeMs = Math.round(performance.now() - startTime);

      self.postMessage({
        type: 'COMPLETE',
        payload: {
          jsonObject: jsonObject,
          flatNodes: flatNodes,
          formattedSize: formatBytes(totalBytes),
          maxDepth: maxDepth,
          totalKeys: totalKeys,
          parseTimeMs: parseTimeMs
        }
      });
    }
  };
`;

let workerInstance: Worker | null = null;
let isWorkerBlockedByCsp = false;

function getWorker(): Worker | null {
  if (isWorkerBlockedByCsp) return null;
  try {
    if (!workerInstance && typeof Blob !== 'undefined' && typeof Worker !== 'undefined') {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      workerInstance = new Worker(workerUrl);
      workerInstance.onerror = () => {
        isWorkerBlockedByCsp = true;
        if (workerInstance) {
          try { workerInstance.terminate(); } catch {}
          workerInstance = null;
        }
      };
    }
    return workerInstance;
  } catch {
    isWorkerBlockedByCsp = true;
    workerInstance = null;
    return null;
  }
}

/**
 * Parses JSON off-thread via a dedicated Web Worker with live progress events and 60fps responsiveness.
 * Automatically falls back to synchronous parsing if Web Workers are restricted by Content Security Policy (CSP).
 */
export async function parseJsonAsync(
  rawJsonText: string,
  defaultExpandDepth: number = 2,
  expandedStateMap?: Map<string, boolean>,
  onProgress?: (progress: ParseProgressPayload) => void
): Promise<ParseWorkerResult> {
  // Payloads under 1MB are fast enough to parse synchronously (<10ms) without triggering CSP warnings
  if (rawJsonText.length < 1024 * 1024 || isWorkerBlockedByCsp) {
    return parseJsonSync(rawJsonText, defaultExpandDepth, expandedStateMap);
  }

  const worker = getWorker();

  // If worker is unavailable (e.g. CSP restrictions), fallback to sync processing
  if (!worker) {
    return parseJsonSync(rawJsonText, defaultExpandDepth, expandedStateMap);
  }

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      worker.removeEventListener('message', messageHandler);
      worker.removeEventListener('error', errorHandler);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };

    const finishWithSync = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      isWorkerBlockedByCsp = true;
      if (workerInstance) {
        try { workerInstance.terminate(); } catch {}
        workerInstance = null;
      }
      resolve(parseJsonSync(rawJsonText, defaultExpandDepth, expandedStateMap));
    };

    const messageHandler = (e: MessageEvent) => {
      if (resolved) return;
      const { type, payload } = e.data || {};

      if (type === 'PROGRESS') {
        if (onProgress) onProgress(payload as ParseProgressPayload);
      } else if (type === 'COMPLETE') {
        resolved = true;
        cleanup();
        resolve(payload as ParseWorkerResult);
      } else if (type === 'ERROR') {
        finishWithSync();
      }
    };

    const errorHandler = () => {
      finishWithSync();
    };

    // If CSP silently prevents worker execution, fallback after 500ms
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        finishWithSync();
      }
    }, 500);

    worker.addEventListener('message', messageHandler);
    worker.addEventListener('error', errorHandler);

    try {
      worker.postMessage({
        type: 'PARSE_PAYLOAD',
        rawText: rawJsonText,
        defaultExpandDepth,
        expandedEntries: expandedStateMap ? Array.from(expandedStateMap.entries()) : []
      });
    } catch {
      finishWithSync();
    }
  });
}

/**
 * Synchronous fallback parser used when Web Workers are blocked.
 */
export function parseJsonSync(
  rawJsonText: string,
  defaultExpandDepth: number = 2,
  expandedStateMap?: Map<string, boolean>
): ParseWorkerResult {
  const startTime = performance.now();
  const jsonObject = parseJson(rawJsonText);
  const parseTimeMs = Math.round(performance.now() - startTime);

  const stats = analyzePayloadStats(rawJsonText, jsonObject, parseTimeMs);
  const flatNodes = buildFlatNodes(jsonObject, defaultExpandDepth, expandedStateMap || new Map());

  return {
    jsonObject,
    flatNodes,
    formattedSize: stats.formattedSize,
    maxDepth: stats.maxDepth,
    totalKeys: stats.totalKeys,
    parseTimeMs
  };
}
