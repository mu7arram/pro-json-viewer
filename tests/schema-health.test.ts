import { describe, it, expect } from 'vitest';
import { findArrayCollections, auditCollectionHealth } from '../src/engine/schema-health';

describe('SchemaHealthEngine', () => {
  it('detects nested array collections and calculates health score', () => {
    const payload = {
      users: [
        { id: 1, name: 'Alice', age: 30, email: 'alice@example.com' },
        { id: 2, name: 'Bob', age: '32', email: null },
        { id: 3, name: 'Charlie' }
      ]
    };

    const collections = findArrayCollections(payload);
    expect(collections.length).toBe(1);
    expect(collections[0].path).toBe('$.users');

    const report = auditCollectionHealth(collections[0]);
    expect(report.totalRecords).toBe(3);
    expect(report.summary.totalFields).toBe(4);

    const emailField = report.fields.find(f => f.name === 'email');
    expect(emailField?.presenceCount).toBe(2);
    expect(emailField?.nullCount).toBe(1);

    const ageField = report.fields.find(f => f.name === 'age');
    expect(ageField?.isTypeInconsistent).toBe(true);
    expect(ageField?.status).toBe('anomaly');

    expect(report.healthScore).toBeLessThan(100);
  });
});
