import { describe, it, expect } from 'vitest';
import { parseJsonSync, parseJsonAsync } from '../src/engine/worker-bridge';

describe('Worker Bridge & Synchronous Fallback', () => {
  const sample = {
    app: 'Pro JSON Viewer',
    version: '1.8.0',
    features: ['tree', 'table', 'chart', 'diagram', 'health']
  };
  const rawText = JSON.stringify(sample);

  describe('parseJsonSync', () => {
    it('synchronously parses JSON and computes metrics', () => {
      const result = parseJsonSync(rawText, 2);

      expect(result.jsonObject).toEqual(sample);
      expect(result.flatNodes.length).toBeGreaterThan(0);
      expect(result.totalKeys).toBe(3); // app, version, features
      expect(result.maxDepth).toBe(3);
      expect(result.formattedSize).toBeDefined();
      expect(typeof result.parseTimeMs).toBe('number');
    });
  });

  describe('parseJsonAsync', () => {
    it('returns parsed result asynchronously via sync fallback in test environment', async () => {
      const result = await parseJsonAsync(rawText, 2);

      expect(result.jsonObject).toEqual(sample);
      expect(result.flatNodes.length).toBeGreaterThan(0);
      expect(result.totalKeys).toBe(3);
    });
  });
});
