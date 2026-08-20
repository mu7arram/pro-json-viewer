import { describe, it, expect } from 'vitest';
import {
  generateTypeScript,
  generateZodSchema,
  analyzePayloadStats,
  formatByteSize
} from '../src/engine/schema-generator';

describe('Schema Generator & Analytics', () => {
  describe('formatByteSize', () => {
    it('formats bytes, kilobytes, and megabytes accurately', () => {
      expect(formatByteSize(500)).toBe('500 B');
      expect(formatByteSize(2048)).toBe('2.0 KB');
      expect(formatByteSize(2 * 1024 * 1024)).toBe('2.00 MB');
    });
  });

  describe('analyzePayloadStats', () => {
    it('calculates total keys, max depth, and array count', () => {
      const data = {
        level1: {
          level2: {
            items: [{ a: 1 }, { b: 2 }]
          }
        },
        title: 'Test'
      };

      const raw = JSON.stringify(data);
      const stats = analyzePayloadStats(raw, data, 12.34);

      expect(stats.totalKeys).toBe(6); // level1, title, level2, items, a, b
      expect(stats.maxDepth).toBe(6);
      expect(stats.arrayCount).toBe(1);
      expect(stats.parseTimeMs).toBe(12.34);
      expect(stats.formattedSize).toBeDefined();
    });
  });

  describe('generateTypeScript', () => {
    it('generates TypeScript interfaces for nested objects and arrays', () => {
      const payload = {
        id: 101,
        name: 'Jane Doe',
        active: true,
        roles: ['admin', 'editor'],
        settings: {
          notifications: true,
          theme: 'dark'
        }
      };

      const ts = generateTypeScript(payload, 'UserPayload');

      expect(ts).toContain('export interface UserPayload {');
      expect(ts).toContain('id: number;');
      expect(ts).toContain('name: string;');
      expect(ts).toContain('active: boolean;');
      expect(ts).toContain('roles: string[];');
      expect(ts).toContain('settings: Settings;');
      expect(ts).toContain('export interface Settings {');
      expect(ts).toContain('notifications: boolean;');
    });

    it('handles root array data', () => {
      const payload = [
        { id: 1, label: 'Item 1' },
        { id: 2, label: 'Item 2' }
      ];

      const ts = generateTypeScript(payload, 'ItemCollection');
      expect(ts).toContain('export type ItemCollection = ItemCollectionItem[];');
      expect(ts).toContain('export interface ItemCollectionItem {');
    });
  });

  describe('generateZodSchema', () => {
    it('generates Zod validation schema code with nested objects', () => {
      const payload = {
        id: 42,
        username: 'coder123',
        verified: false,
        tags: ['web', 'extension']
      };

      const zodCode = generateZodSchema(payload, 'userSchema');

      expect(zodCode).toContain("import { z } from 'zod';");
      expect(zodCode).toContain('export const userSchema = z.object({');
      expect(zodCode).toContain('id: z.number(),');
      expect(zodCode).toContain('username: z.string(),');
      expect(zodCode).toContain('verified: z.boolean(),');
      expect(zodCode).toContain('tags: z.array(z.string()),');
    });
  });
});
