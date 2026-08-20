import { describe, it, expect } from 'vitest';
import { jsonToCsv, jsonToYaml } from '../src/engine/export-engine';

describe('ExportEngine', () => {
  it('converts array to RFC 4180 compliant CSV', () => {
    const data = [
      { id: 1, name: 'Alice, Jr.', quote: 'He said "Hello"' },
      { id: 2, name: 'Bob', quote: 'Simple text' }
    ];

    const csv = jsonToCsv(data);
    expect(csv).toContain('"Alice, Jr."');
    expect(csv).toContain('"He said ""Hello"""');
  });

  it('converts JSON to clean YAML format', () => {
    const data = { server: { port: 8080, enabled: true, tags: ['web', 'api'] } };
    const yaml = jsonToYaml(data);
    expect(yaml).toContain('server:');
    expect(yaml).toContain('  port: 8080');
    expect(yaml).toContain('  - web');
  });
});