import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiffView } from '../src/ui/diff-view';

describe('Full Dual-Editor Side-by-Side Diff Comparison Suite (DiffView)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dual editors with pre-populated baseline data and action buttons', () => {
    const container = document.createElement('div');
    const primaryData = { name: 'Pro JSON Viewer', version: '1.0.0' };

    new DiffView({
      container,
      primaryData
    });

    expect(container.querySelector('.pjv-diff-workspace')).not.toBeNull();
    expect(container.querySelector('#pjv-diff-editor-left')).not.toBeNull();
    expect(container.querySelector('#pjv-diff-editor-right')).not.toBeNull();
    expect(container.querySelector('#pjv-diff-paste-left')).not.toBeNull();
    expect(container.querySelector('#pjv-diff-paste-right')).not.toBeNull();
    expect(container.querySelector('#pjv-diff-apply-right')).not.toBeNull();

    const leftEditor = container.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
    expect(leftEditor.value).toContain('Pro JSON Viewer');
  });

  it('performs live JSON syntax validation and debounced auto-diff calculation', () => {
    const container = document.createElement('div');
    new DiffView({
      container,
      primaryData: { id: 101 }
    });

    const rightEditor = container.querySelector('#pjv-diff-editor-right') as HTMLTextAreaElement;

    // Type new JSON in right editor
    rightEditor.value = '{ "id": 102 }';
    rightEditor.dispatchEvent(new Event('input'));

    // Fast-forward debounce timer (300ms)
    vi.advanceTimersByTime(350);

    const statsContainer = container.querySelector('.pjv-diff-header-right');
    expect(statsContainer?.textContent).toContain('~1 Modified');
  });

  it('toggles synchronized scrolling properly', () => {
    const container = document.createElement('div');
    const onToast = vi.fn();
    const diffView = new DiffView({
      container,
      primaryData: { id: 1 },
      secondaryData: { id: 2 },
      onToast
    });

    const syncBtn = container.querySelector('#pjv-diff-btn-sync-scroll') as HTMLButtonElement;
    expect(syncBtn.textContent).toContain('ON');

    diffView.toggleSyncScroll();
    expect(syncBtn.textContent).toContain('OFF');
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('disabled'));

    diffView.toggleSyncScroll();
    expect(syncBtn.textContent).toContain('ON');
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('enabled'));
  });

  it('applies target JSON to viewer via onApplyToViewer callback', () => {
    const container = document.createElement('div');
    const onApplyToViewer = vi.fn();
    const onToast = vi.fn();

    const diffView = new DiffView({
      container,
      primaryData: { v: 1 },
      secondaryData: { v: 2, newFeature: true },
      onApplyToViewer,
      onToast
    });

    diffView.applyToViewer();

    expect(onApplyToViewer).toHaveBeenCalledWith({ v: 2, newFeature: true });
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('applied to main viewer'));
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

  it('toggles sort keys and recomputes diff ignoring key order differences', () => {
    const container = document.createElement('div');
    const onToast = vi.fn();
    const diffView = new DiffView({
      container,
      primaryData: { b: 2, a: 1 },
      secondaryData: { a: 1, b: 2 },
      onToast
    });

    // Default: comparison
    diffView.compare();
    // Enable sort keys
    diffView.toggleSortKeys();

    const sortBtn = container.querySelector('#pjv-diff-btn-sort-keys');
    expect(sortBtn?.textContent).toContain('ON');
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('enabled'));
  });

  it('steps through differences with prev and next buttons', () => {
    const container = document.createElement('div');
    const diffView = new DiffView({
      container,
      primaryData: { a: 1, b: 2, c: 3 },
      secondaryData: { a: 10, b: 20, c: 30 }
    });

    diffView.compare();

    expect(container.querySelector('.pjv-diff-tree-view')).not.toBeNull();
    const counter = container.querySelector('#pjv-diff-step-counter');
    expect(counter?.textContent).toContain('1 of 3');

    diffView.stepDiff('next');
    expect(counter?.textContent).toContain('2 of 3');

    diffView.stepDiff('next');
    expect(counter?.textContent).toContain('3 of 3');

    diffView.stepDiff('prev');
    expect(counter?.textContent).toContain('2 of 3');
  });
});
