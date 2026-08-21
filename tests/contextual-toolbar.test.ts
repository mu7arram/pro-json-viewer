import { describe, it, expect, vi } from 'vitest';
import { getJsonMaxDepth } from '../src/engine/schema-generator';
import { Toolbar } from '../src/ui/toolbar';
import { DiagramView } from '../src/ui/diagram-view';

describe('Dynamic Depth Detection & Contextual Toolbar', () => {
  describe('getJsonMaxDepth', () => {
    it('calculates depth for flat objects', () => {
      const flat = { name: 'Alice', age: 30 };
      expect(getJsonMaxDepth(flat)).toBe(2);
    });

    it('calculates depth for nested hierarchy', () => {
      const nested = {
        level1: {
          level2: {
            level3: 'deep'
          }
        }
      };
      expect(getJsonMaxDepth(nested)).toBe(4);
    });

    it('calculates depth for arrays and nested collections', () => {
      const data = {
        users: [
          {
            id: 1,
            profile: {
              address: {
                city: 'San Francisco'
              }
            }
          }
        ]
      };
      // depth 1: root object
      // depth 2: users array
      // depth 3: user[0] object
      // depth 4: profile object
      // depth 5: address object
      // depth 6: city string
      expect(getJsonMaxDepth(data)).toBe(6);
    });

    it('returns depth 1 for primitives', () => {
      expect(getJsonMaxDepth('just a string')).toBe(1);
      expect(getJsonMaxDepth(42)).toBe(1);
    });
  });

  describe('Toolbar Component', () => {
    it('renders 2-tier layout with global topbar and contextual sub-toolbar', () => {
      const container = document.createElement('div');
      const onViewModeChange = vi.fn();
      const onSearchChange = vi.fn();
      const onExpandDepth = vi.fn();

      new Toolbar({
        container,
        maxDepth: 3,
        onViewModeChange,
        onSearchChange,
        onExpandDepth,
        onCollapseAll: vi.fn(),
        onExpandAll: vi.fn(),
        onCopyAll: vi.fn(),
        onDownload: vi.fn(),
        onOpenDiff: vi.fn(),
        onOpenOptions: vi.fn()
      });

      expect(container.querySelector('.pjv-toolbar-global')).not.toBeNull();
      expect(container.querySelector('.pjv-toolbar-sub')).not.toBeNull();

      // Tree mode sub-toolbar controls
      expect(container.querySelector('#pjv-search-input')).not.toBeNull();
      expect(container.querySelector('#pjv-btn-depth-1')).not.toBeNull();
      expect(container.querySelector('#pjv-btn-depth-2')).not.toBeNull();
      expect(container.querySelector('#pjv-btn-depth-3')).not.toBeNull();
      // Depth 4 should not exist when maxDepth is 3
      expect(container.querySelector('#pjv-btn-depth-4')).toBeNull();
    });

    it('adapts sub-toolbar controls dynamically on view mode switch', () => {
      const container = document.createElement('div');
      const onViewModeChange = vi.fn();

      const toolbar = new Toolbar({
        container,
        maxDepth: 4,
        onViewModeChange,
        onSearchChange: vi.fn(),
        onExpandDepth: vi.fn(),
        onCollapseAll: vi.fn(),
        onExpandAll: vi.fn(),
        onCopyAll: vi.fn(),
        onDownload: vi.fn(),
        onOpenDiff: vi.fn(),
        onOpenOptions: vi.fn()
      });

      // Switch to Raw mode
      toolbar.setViewMode('raw');
      expect(onViewModeChange).toHaveBeenCalledWith('raw');

      // Sub-toolbar should now mount Raw tools (Format, Minify, Wrap)
      expect(container.querySelector('#pjv-btn-raw-format')).not.toBeNull();
      expect(container.querySelector('#pjv-btn-raw-minify')).not.toBeNull();
      expect(container.querySelector('#pjv-btn-raw-wrap')).not.toBeNull();
      // Tree search should no longer be in the DOM
      expect(container.querySelector('#pjv-search-input')).toBeNull();
    });

    it('dynamically updates depth buttons when new max depth is supplied', () => {
      const container = document.createElement('div');

      const toolbar = new Toolbar({
        container,
        maxDepth: 2,
        onViewModeChange: vi.fn(),
        onSearchChange: vi.fn(),
        onExpandDepth: vi.fn(),
        onCollapseAll: vi.fn(),
        onExpandAll: vi.fn(),
        onCopyAll: vi.fn(),
        onDownload: vi.fn(),
        onOpenDiff: vi.fn(),
        onOpenOptions: vi.fn()
      });

      expect(container.querySelector('#pjv-btn-depth-2')).not.toBeNull();
      expect(container.querySelector('#pjv-btn-depth-5')).toBeNull();

      // Update max depth to 5
      toolbar.updateMaxDepth(5);
      expect(container.querySelector('#pjv-btn-depth-5')).not.toBeNull();
    });
  });

  describe('DiagramView Component', () => {
    it('renders dynamic depth buttons bounded by maxDepth', () => {
      const container = document.createElement('div');
      const data = {
        app: 'Pro JSON',
        meta: {
          author: 'Dev'
        }
      };

      new DiagramView({
        container,
        data,
        maxDepth: 3
      });

      expect(container.querySelector('#pjv-diag-d1')).not.toBeNull();
      expect(container.querySelector('#pjv-diag-d2')).not.toBeNull();
      expect(container.querySelector('#pjv-diag-d3')).not.toBeNull();
      // Depth 5 should not exist when maxDepth is 3
      expect(container.querySelector('#pjv-diag-d5')).toBeNull();
    });
  });
});
