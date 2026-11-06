import { describe, it, expect } from 'vitest';
import {
  parseJson,
  buildFlatNodes,
  getNodeType,
  formatJsonPreservingNumbers,
  minifyJsonPreservingNumbers
} from '../src/engine/parser';

describe('Parser & JSON Flattener', () => {
  describe('getNodeType', () => {
    it('accurately identifies data types', () => {
      expect(getNodeType(null)).toBe('null');
      expect(getNodeType([1, 2])).toBe('array');
      expect(getNodeType({ a: 1 })).toBe('object');
      expect(getNodeType('hello')).toBe('string');
      expect(getNodeType(123)).toBe('number');
      expect(getNodeType(true)).toBe('boolean');
    });
  });

  describe('parseJson', () => {
    it('parses valid JSON strings', () => {
      const parsed = parseJson('{"name": "Alice", "age": 25}');
      expect(parsed).toEqual({ name: 'Alice', age: 25 });
    });

    it('repairs relaxed JSON with trailing commas and single quotes', () => {
      const relaxed = "{\n  'name': 'Bob',\n  'items': [1, 2, ],\n}";
      const parsed = parseJson(relaxed);
      expect(parsed.name).toBe('Bob');
      expect(parsed.items).toEqual([1, 2]);
    });

    it('throws descriptive error on unrepairable syntax', () => {
      expect(() => parseJson('{ invalid json ::: ')).toThrowError(/Invalid JSON syntax/);
    });
  });

  describe('buildFlatNodes', () => {
    const sample = {
      user: {
        id: 1,
        profile: {
          bio: 'Developer'
        }
      },
      tags: ['typescript', 'react']
    };

    it('generates virtualized flat nodes with depth and hierarchy paths', () => {
      const nodes = buildFlatNodes(sample, 2);
      expect(nodes.length).toBeGreaterThan(0);

      // Root node uses canonical '$' ID and path
      const rootNode = nodes.find((n) => n.depth === 1);
      expect(rootNode).toBeDefined();
      expect(rootNode?.id).toBe('$');
      expect(rootNode?.path).toBe('$');
      expect(rootNode?.hasChildren).toBe(true);

      // Deeply nested node JSONPath
      const tagNode = nodes.find((n) => n.path === '$.tags[0]');
      expect(tagNode).toBeDefined();
      expect(tagNode?.value).toBe('typescript');
    });

    it('respects defaultExpandDepth', () => {
      // Depth 0 -> everything collapsed except root level
      const collapsedNodes = buildFlatNodes(sample, 0);
      expect(collapsedNodes.length).toBe(1);

      // Depth 10 -> fully expanded tree
      const expandedNodes = buildFlatNodes(sample, 10);
      expect(expandedNodes.length).toBeGreaterThan(collapsedNodes.length);
    });

    it('respects expandedStateMap overrides', () => {
      const stateMap = new Map<string, boolean>();
      stateMap.set('$.user', false); // Explicitly collapse $.user

      const nodes = buildFlatNodes(sample, 5, stateMap);
      const userNode = nodes.find((n) => n.id === '$.user');
      expect(userNode?.isExpanded).toBe(false);

      // profile should not be rendered because user is collapsed
      const profileNode = nodes.find((n) => n.id === '$.user.profile');
      expect(profileNode).toBeUndefined();
    });

    it('avoids node ID collisions when object keys contain dots or spaces', () => {
      const dottedPayload = {
        'a.b': { c: 'dotted-key' },
        a: { b: { c: 'nested-key' } }
      };

      const nodes = buildFlatNodes(dottedPayload, 5);
      const ids = nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('$["a.b"].c');
      expect(ids).toContain('$.a.b.c');
    });
  });

  describe('64-bit integer precision preservation', () => {
    it('preserves integers beyond Number.MAX_SAFE_INTEGER when formatting and minifying', () => {
      const raw = '{"bigId":9007199254740993,"nested":{"snowflake":18446744073709551615}}';
      const formatted = formatJsonPreservingNumbers(raw, 2);
      expect(formatted).toContain('"bigId": 9007199254740993');
      expect(formatted).toContain('"snowflake": 18446744073709551615');

      const minified = minifyJsonPreservingNumbers(formatted);
      expect(minified).toBe(raw);
    });
  });
});
