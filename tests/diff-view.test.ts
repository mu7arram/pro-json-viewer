import { describe, it, expect, vi } from 'vitest';
import { DiffView } from '../src/ui/diff-view';

describe('Full Dual-Editor Side-by-Side Diff Comparison Suite (DiffView)', () => {
  it('renders dual editors with pre-populated baseline data', () => {
    const container = document.createElement('div');
    const primaryData = { name: 'Pro JSON Viewer', version: '1.0.0' };

    new DiffView({
      container,
      primaryData
    });

    expect(container.querySelector('.pjv-diff-workspace')).not.toBeNull();
    expect(container.querySelector('#pjv-diff-editor-left')).not.toBeNull();
    expect(container.querySelector('#pjv-diff-editor-right')).not.toBeNull();

    const leftEditor = container.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
    expect(leftEditor.value).toContain('Pro JSON Viewer');
  });

  it('performs live JSON syntax validation on input', () => {
    const container = document.createElement('div');
    new DiffView({
      container,
      primaryData: { id: 101 }
    });

    const leftEditor = container.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
    const rightEditor = container.querySelector('#pjv-diff-editor-right') as HTMLTextAreaElement;

    // Type invalid JSON in right editor
    rightEditor.value = '{ "invalid": ';
    rightEditor.dispatchEvent(new Event('input'));

    const rightPill = container.querySelectorAll('.pjv-status-pill')[1];
    expect(rightPill.textContent).toContain('Invalid');

    // Fix JSON in right editor
    rightEditor.value = '{ "valid": true }';
    rightEditor.dispatchEvent(new Event('input'));

    const fixedRightPill = container.querySelectorAll('.pjv-status-pill')[1];
    expect(fixedRightPill.textContent).toContain('Valid JSON');
  });

  it('swaps Left and Right editor contents seamlessly', () => {
    const container = document.createElement('div');
    const diffView = new DiffView({
      container,
      primaryData: { side: 'LEFT' },
      secondaryData: { side: 'RIGHT' }
    });

    const leftEditor = container.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
    const rightEditor = container.querySelector('#pjv-diff-editor-right') as HTMLTextAreaElement;

    expect(leftEditor.value).toContain('LEFT');
    expect(rightEditor.value).toContain('RIGHT');

    diffView.swapSides();

    const newLeftEditor = container.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
    const newRightEditor = container.querySelector('#pjv-diff-editor-right') as HTMLTextAreaElement;

    expect(newLeftEditor.value).toContain('RIGHT');
    expect(newRightEditor.value).toContain('LEFT');
  });

  it('formats both JSON documents simultaneously', () => {
    const container = document.createElement('div');
    const diffView = new DiffView({
      container,
      primaryData: null
    });

    const leftEditor = container.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
    const rightEditor = container.querySelector('#pjv-diff-editor-right') as HTMLTextAreaElement;

    leftEditor.value = '{"unformatted":true,"count":1}';
    leftEditor.dispatchEvent(new Event('input'));
    rightEditor.value = '{"nested":{"key":"value"}}';
    rightEditor.dispatchEvent(new Event('input'));

    diffView.formatBoth();

    const formattedLeft = container.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
    const formattedRight = container.querySelector('#pjv-diff-editor-right') as HTMLTextAreaElement;

    expect(formattedLeft.value).toContain('  "unformatted": true');
    expect(formattedRight.value).toContain('    "key": "value"');
  });

  it('computes diff and renders interactive visual diff tree with accurate badges', () => {
    const container = document.createElement('div');
    const onToast = vi.fn();

    const diffView = new DiffView({
      container,
      primaryData: {
        title: 'Original Title',
        oldKey: 'to be removed',
        count: 5
      },
      secondaryData: {
        title: 'Modified Title',
        newKey: 'newly added',
        count: 5
      },
      onToast
    });

    // Run Compare
    diffView.compare();

    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('Diff ready: +1 added, -1 removed, ~1 modified'));

    // Visual Diff Tree should be active
    expect(container.querySelector('.pjv-diff-tree-view')).not.toBeNull();

    const addedRows = container.querySelectorAll('.diff-added');
    const removedRows = container.querySelectorAll('.diff-removed');
    const modifiedRows = container.querySelectorAll('.diff-modified');

    expect(addedRows.length).toBe(1);
    expect(removedRows.length).toBe(1);
    expect(modifiedRows.length).toBe(1);

    // Modified row should show old -> new values
    const modifiedRow = container.querySelector('.diff-modified')!;
    expect(modifiedRow.textContent).toContain('Original Title');
    expect(modifiedRow.textContent).toContain('Modified Title');
  });
});
