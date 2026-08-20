import { describe, it, expect } from 'vitest';
import { searchTree } from '../src/engine/jsonpath';
import { buildFlatNodes } from '../src/engine/parser';

describe('JSONPath & Search Engine', () => {
  const data = {
    store: {
      book: [
        { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
        { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 }
      ]
    }
  };

  it('filters nodes using plain text search', () => {
    const flatNodes = buildFlatNodes(data, 10, new Map());
    const { matchedIds } = searchTree(flatNodes, 'fiction', 'text');
    expect(matchedIds.size).toBeGreaterThan(0);
  });

  it('evaluates JSONPath queries matching node paths', () => {
    const flatNodes = buildFlatNodes(data, 10, new Map());
    const { matchedIds } = searchTree(flatNodes, 'store.book', 'jsonpath');
    expect(matchedIds.size).toBeGreaterThan(0);
  });
});