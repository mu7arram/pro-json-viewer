import { describe, it, expect } from 'vitest';
import { computeStructuralDiff, sortObjectKeys } from '../src/engine/diff-engine';

describe('Structural Diff Engine', () => {
  it('identifies added, removed, and modified keys between two JSON objects', () => {
    const primary = {
      name: 'Widget A',
      price: 29.99,
      status: 'active'
    };

    const secondary = {
      name: 'Widget A (Updated)', // modified
      price: 29.99,              // unchanged
      stock: 150                 // added
      // status is removed
    };

    const { diffNodes, stats } = computeStructuralDiff(primary, secondary);

    expect(stats.modified).toBe(1); // name
    expect(stats.removed).toBe(1);  // status
    expect(stats.added).toBe(1);    // stock

    const modifiedNode = diffNodes.find((n) => n.key === 'name');
    expect(modifiedNode?.diffStatus).toBe('modified');

    const removedNode = diffNodes.find((n) => n.key === 'status');
    expect(removedNode?.diffStatus).toBe('removed');

    const addedNode = diffNodes.find((n) => n.key === 'stock');
    expect(addedNode?.diffStatus).toBe('added');
  });

  it('identifies identical payloads as all unchanged', () => {
    const data = { id: 1, tags: ['a', 'b'] };
    const { diffNodes, stats } = computeStructuralDiff(data, data);

    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
    expect(stats.modified).toBe(0);

    const nonUnchanged = diffNodes.filter((n) => n.diffStatus !== 'unchanged');
    expect(nonUnchanged.length).toBe(0);
  });

  it('sortObjectKeys sorts object keys recursively to eliminate order-based differences', () => {
    const objA = { z: 1, a: { b: 2, a: 1 } };
    const objB = { a: { a: 1, b: 2 }, z: 1 };

    const sortedA = sortObjectKeys(objA);
    const sortedB = sortObjectKeys(objB);

    expect(Object.keys(sortedA)).toEqual(['a', 'z']);
    expect(Object.keys(sortedA.a)).toEqual(['a', 'b']);
    expect(JSON.stringify(sortedA)).toBe(JSON.stringify(sortedB));
  });
});
