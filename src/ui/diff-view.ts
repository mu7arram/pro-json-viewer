import { computeStructuralDiff } from '../engine/diff-engine';
import { FlatNode } from '../shared/types';
import { copyToClipboard, escapeHtml } from '../shared/utils';

export interface DiffViewOptions {
  container: HTMLElement;
  primaryData: any;
  secondaryData?: any;
  onToast?: (msg: string) => void;
  onApplyToViewer?: (updatedData: any) => void;
}

export class DiffView {
  private container: HTMLElement;
  private primaryData: any;
  private secondaryData: any;
  private onToast?: (msg: string) => void;

  private leftText: string = '';
  private rightText: string = '';
  private leftValid: boolean = true;
  private rightValid: boolean = true;
  private leftErrorMsg: string = '';
  private rightErrorMsg: string = '';

  private activeTab: 'editors' | 'tree' = 'editors';
  private diffResult: { diffNodes: FlatNode[]; stats: { added: number; removed: number; modified: number } } | null = null;
  private diffFilter: 'all' | 'added' | 'removed' | 'modified' = 'all';
  private searchQuery: string = '';

  constructor(options: DiffViewOptions) {
    this.container = options.container;
    this.primaryData = options.primaryData;
    this.secondaryData = options.secondaryData;
    this.onToast = options.onToast;

    this.leftText = this.primaryData !== undefined ? JSON.stringify(this.primaryData, null, 2) : '';
    this.rightText = this.secondaryData !== undefined ? JSON.stringify(this.secondaryData, null, 2) : '';

    this.validateInputs();
    this.runInitialDiff();
    this.render();
  }

  private validateInputs() {
    // Validate Left
    if (!this.leftText.trim()) {
      this.leftValid = false;
      this.leftErrorMsg = 'Empty JSON document';
    } else {
      try {
        JSON.parse(this.leftText);
        this.leftValid = true;
        this.leftErrorMsg = '';
      } catch (err: any) {
        this.leftValid = false;
        this.leftErrorMsg = err.message || 'Invalid JSON syntax';
      }
    }

    // Validate Right
    if (!this.rightText.trim()) {
      this.rightValid = false;
      this.rightErrorMsg = 'Empty secondary payload';
    } else {
      try {
        JSON.parse(this.rightText);
        this.rightValid = true;
        this.rightErrorMsg = '';
      } catch (err: any) {
        this.rightValid = false;
        this.rightErrorMsg = err.message || 'Invalid JSON syntax';
      }
    }
  }

  private runInitialDiff() {
    if (this.leftValid && this.rightValid) {
      try {
        const leftObj = JSON.parse(this.leftText);
        const rightObj = JSON.parse(this.rightText);
        this.diffResult = computeStructuralDiff(leftObj, rightObj);
      } catch {
        this.diffResult = null;
      }
    } else {
      this.diffResult = null;
    }
  }

  public compare() {
    this.validateInputs();
    if (!this.leftValid) {
      if (this.onToast) this.onToast(`⚠️ Left editor error: ${this.leftErrorMsg}`);
      this.render();
      return;
    }
    if (!this.rightValid) {
      if (this.onToast) this.onToast(`⚠️ Right editor error: ${this.rightErrorMsg}`);
      this.render();
      return;
    }

    try {
      const leftObj = JSON.parse(this.leftText);
      const rightObj = JSON.parse(this.rightText);
      this.diffResult = computeStructuralDiff(leftObj, rightObj);
      this.activeTab = 'tree';
      this.render();
      if (this.onToast) {
        const { added, removed, modified } = this.diffResult.stats;
        this.onToast(`Diff ready: +${added} added, -${removed} removed, ~${modified} modified`);
      }
    } catch (err: any) {
      if (this.onToast) this.onToast(`Diff failed: ${err.message}`);
    }
  }

  public formatBoth() {
    let formattedLeft = false;
    let formattedRight = false;

    if (this.leftText.trim()) {
      try {
        this.leftText = JSON.stringify(JSON.parse(this.leftText), null, 2);
        formattedLeft = true;
      } catch {}
    }

    if (this.rightText.trim()) {
      try {
        this.rightText = JSON.stringify(JSON.parse(this.rightText), null, 2);
        formattedRight = true;
      } catch {}
    }

    this.validateInputs();
    this.render();
    if (this.onToast) {
      if (formattedLeft && formattedRight) this.onToast('✨ Formatted both JSON documents');
      else if (formattedLeft || formattedRight) this.onToast('✨ Formatted valid JSON document');
      else this.onToast('⚠️ Could not format invalid JSON');
    }
  }

  public swapSides() {
    const tempText = this.leftText;
    this.leftText = this.rightText;
    this.rightText = tempText;

    this.validateInputs();
    this.runInitialDiff();
    this.render();
    if (this.onToast) this.onToast('🔄 Swapped Left ⬄ Right documents');
  }

  public clear(side: 'left' | 'right' | 'both') {
    if (side === 'left' || side === 'both') {
      this.leftText = '';
    }
    if (side === 'right' || side === 'both') {
      this.rightText = '';
    }
    this.validateInputs();
    this.diffResult = null;
    this.render();
    if (this.onToast) this.onToast('🧹 Cleared editor content');
  }

  public setSampleData() {
    const sampleOriginal = {
      name: "Enterprise Pro Service",
      version: "1.2.0",
      status: "active",
      config: {
        timeoutMs: 5000,
        retries: 3,
        logging: true
      },
      tags: ["api", "json", "production"]
    };

    const sampleModified = {
      name: "Enterprise Pro Service (v2)",
      version: "2.0.0",
      config: {
        timeoutMs: 8000,
        retries: 3,
        logging: false,
        debugMode: true
      },
      tags: ["api", "json", "production", "v2-upgrade"],
      region: "us-east-1"
    };

    this.leftText = JSON.stringify(sampleOriginal, null, 2);
    this.rightText = JSON.stringify(sampleModified, null, 2);
    this.validateInputs();
    this.runInitialDiff();
    this.render();
    if (this.onToast) this.onToast('📋 Loaded sample comparison payloads');
  }

  private render() {
    this.container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'pjv-diff-workspace';

    // 1. Action Header Toolbar
    const stats = this.diffResult?.stats || { added: 0, removed: 0, modified: 0 };
    const hasDiff = this.diffResult !== null;

    const header = document.createElement('div');
    header.className = 'pjv-diff-header';
    header.innerHTML = `
      <div class="pjv-diff-header-left">
        <div class="pjv-btn-group pjv-diff-tab-group">
          <button id="pjv-diff-tab-editors" class="pjv-btn ${this.activeTab === 'editors' ? 'active' : ''}">
            📝 Side-by-Side Editors
          </button>
          <button id="pjv-diff-tab-tree" class="pjv-btn ${this.activeTab === 'tree' ? 'active' : ''}">
            🔀 Visual Diff Tree ${hasDiff ? `(${stats.added + stats.removed + stats.modified} diffs)` : ''}
          </button>
        </div>

        <div class="pjv-btn-group">
          <button id="pjv-diff-btn-compare" class="pjv-btn pjv-btn-primary" title="Compare Left and Right JSON">
            ⚡ Compare Diff
          </button>
          <button id="pjv-diff-btn-format" class="pjv-btn" title="Beautify and format both documents">
            ✨ Format Both
          </button>
          <button id="pjv-diff-btn-swap" class="pjv-btn" title="Swap Left and Right documents">
            🔄 Swap Sides
          </button>
          <button id="pjv-diff-btn-sample" class="pjv-btn" title="Load sample diff payload">
            📋 Sample
          </button>
          <button id="pjv-diff-btn-clear" class="pjv-btn" title="Clear right payload">
            🧹 Clear Right
          </button>
        </div>
      </div>

      <div class="pjv-diff-header-right">
        ${hasDiff ? `
          <div class="pjv-diff-stats-pills">
            <span class="pjv-diff-pill added">+${stats.added} Added</span>
            <span class="pjv-diff-pill removed">-${stats.removed} Removed</span>
            <span class="pjv-diff-pill modified">~${stats.modified} Modified</span>
          </div>
        ` : `
          <span class="pjv-diff-hint">Paste or edit JSON on both sides and click <strong>Compare Diff</strong></span>
        `}
      </div>
    `;

    wrapper.appendChild(header);

    // 2. Body View (Editors or Visual Diff Tree)
    if (this.activeTab === 'editors') {
      const editorsGrid = document.createElement('div');
      editorsGrid.className = 'pjv-diff-editors-grid';

      // Left Pane
      const leftPane = document.createElement('div');
      leftPane.className = 'pjv-diff-pane';
      const leftLineCount = this.leftText ? this.leftText.split('\n').length : 0;
      leftPane.innerHTML = `
        <div class="pjv-diff-pane-header">
          <div class="pjv-diff-pane-title">
            <span class="pjv-diff-indicator left"></span>
            <strong>Baseline JSON (Original / Left)</strong>
            <span class="pjv-diff-char-count">${leftLineCount} lines • ${this.leftText.length} chars</span>
          </div>
          <div class="pjv-diff-pane-actions">
            <span class="pjv-status-pill ${this.leftValid ? 'healthy' : 'anomaly'}">
              ${this.leftValid ? '✓ Valid JSON' : '⚠️ Invalid'}
            </span>
            <button id="pjv-diff-copy-left" class="pjv-btn pjv-btn-xs" title="Copy left JSON">📋 Copy</button>
          </div>
        </div>
        ${!this.leftValid && this.leftErrorMsg ? `<div class="pjv-diff-error-banner">⚠️ ${escapeHtml(this.leftErrorMsg)}</div>` : ''}
        <textarea id="pjv-diff-editor-left" class="pjv-diff-editor" placeholder='Paste Baseline JSON here (e.g. {"version": 1.0, ...})' spellcheck="false"></textarea>
      `;

      // Right Pane
      const rightPane = document.createElement('div');
      rightPane.className = 'pjv-diff-pane';
      const rightLineCount = this.rightText ? this.rightText.split('\n').length : 0;
      rightPane.innerHTML = `
        <div class="pjv-diff-pane-header">
          <div class="pjv-diff-pane-title">
            <span class="pjv-diff-indicator right"></span>
            <strong>Target JSON (Modified / Right)</strong>
            <span class="pjv-diff-char-count">${rightLineCount} lines • ${this.rightText.length} chars</span>
          </div>
          <div class="pjv-diff-pane-actions">
            <span class="pjv-status-pill ${this.rightValid ? 'healthy' : 'anomaly'}">
              ${this.rightValid ? '✓ Valid JSON' : '⚠️ Invalid'}
            </span>
            <button id="pjv-diff-copy-right" class="pjv-btn pjv-btn-xs" title="Copy right JSON">📋 Copy</button>
            <button id="pjv-diff-clear-right" class="pjv-btn pjv-btn-xs" title="Clear right editor">🧹 Clear</button>
          </div>
        </div>
        ${!this.rightValid && this.rightErrorMsg ? `<div class="pjv-diff-error-banner">⚠️ ${escapeHtml(this.rightErrorMsg)}</div>` : ''}
        <textarea id="pjv-diff-editor-right" class="pjv-diff-editor" placeholder='Paste Target JSON here to compare...' spellcheck="false"></textarea>
      `;

      editorsGrid.appendChild(leftPane);
      editorsGrid.appendChild(rightPane);
      wrapper.appendChild(editorsGrid);

      // Populate Textareas
      const leftTextarea = leftPane.querySelector('#pjv-diff-editor-left') as HTMLTextAreaElement;
      const rightTextarea = rightPane.querySelector('#pjv-diff-editor-right') as HTMLTextAreaElement;
      leftTextarea.value = this.leftText;
      rightTextarea.value = this.rightText;

      // Event Handlers for Editors
      leftTextarea.addEventListener('input', () => {
        this.leftText = leftTextarea.value;
        this.validateInputs();
        const pill = leftPane.querySelector('.pjv-status-pill');
        if (pill) {
          pill.className = `pjv-status-pill ${this.leftValid ? 'healthy' : 'anomaly'}`;
          pill.textContent = this.leftValid ? '✓ Valid JSON' : '⚠️ Invalid';
        }
      });

      rightTextarea.addEventListener('input', () => {
        this.rightText = rightTextarea.value;
        this.validateInputs();
        const pill = rightPane.querySelector('.pjv-status-pill');
        if (pill) {
          pill.className = `pjv-status-pill ${this.rightValid ? 'healthy' : 'anomaly'}`;
          pill.textContent = this.rightValid ? '✓ Valid JSON' : '⚠️ Invalid';
        }
      });

      leftPane.querySelector('#pjv-diff-copy-left')?.addEventListener('click', () => {
        copyToClipboard(this.leftText);
        if (this.onToast) this.onToast('Copied baseline JSON!');
      });

      rightPane.querySelector('#pjv-diff-copy-right')?.addEventListener('click', () => {
        copyToClipboard(this.rightText);
        if (this.onToast) this.onToast('Copied target JSON!');
      });

      rightPane.querySelector('#pjv-diff-clear-right')?.addEventListener('click', () => this.clear('right'));

    } else {
      // 3. Visual Diff Tree View
      const treeViewWrapper = document.createElement('div');
      treeViewWrapper.className = 'pjv-diff-tree-view';

      const filterBar = document.createElement('div');
      filterBar.className = 'pjv-diff-filter-bar';
      filterBar.innerHTML = `
        <div class="pjv-btn-group">
          <button id="pjv-filter-diff-all" class="pjv-btn ${this.diffFilter === 'all' ? 'active' : ''}">All Nodes</button>
          <button id="pjv-filter-diff-added" class="pjv-btn ${this.diffFilter === 'added' ? 'active' : ''}">+ Added (${stats.added})</button>
          <button id="pjv-filter-diff-removed" class="pjv-btn ${this.diffFilter === 'removed' ? 'active' : ''}">- Removed (${stats.removed})</button>
          <button id="pjv-filter-diff-modified" class="pjv-btn ${this.diffFilter === 'modified' ? 'active' : ''}">~ Modified (${stats.modified})</button>
        </div>

        <div class="pjv-diff-tree-search">
          <input type="text" id="pjv-diff-search-input" placeholder="Search diff properties or values..." value="${escapeHtml(this.searchQuery)}" />
        </div>

        <div class="pjv-btn-group">
          <button id="pjv-diff-expand-all" class="pjv-btn">Expand All</button>
          <button id="pjv-diff-collapse-all" class="pjv-btn">Collapse All</button>
        </div>
      `;

      treeViewWrapper.appendChild(filterBar);

      const treeContent = document.createElement('div');
      treeContent.className = 'pjv-diff-tree-content';

      if (!this.diffResult || this.diffResult.diffNodes.length === 0) {
        treeContent.innerHTML = `
          <div class="pjv-diff-empty">
            <div style="font-size: 32px; margin-bottom: 8px;">🔀</div>
            <strong>No diff computed yet</strong>
            <p style="font-size: 12px; color: var(--pjv-text-muted); margin-top: 4px;">
              Switch to Side-by-Side Editors, paste both documents, and click <strong>Compare Diff</strong>.
            </p>
          </div>
        `;
      } else {
        const filteredNodes = this.diffResult.diffNodes.filter((node) => {
          if (this.diffFilter !== 'all' && node.diffStatus !== this.diffFilter) {
            return false;
          }
          if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            const keyMatch = node.key ? String(node.key).toLowerCase().includes(q) : false;
            const valMatch = node.value ? JSON.stringify(node.value).toLowerCase().includes(q) : false;
            const pathMatch = node.path ? node.path.toLowerCase().includes(q) : false;
            return keyMatch || valMatch || pathMatch;
          }
          return true;
        });

        if (filteredNodes.length === 0) {
          treeContent.innerHTML = `
            <div class="pjv-diff-empty">
              <strong>No diff items match filter "${this.diffFilter}"</strong>
            </div>
          `;
        } else {
          filteredNodes.forEach((node) => {
            const row = document.createElement('div');
            row.className = `pjv-diff-row diff-${node.diffStatus || 'unchanged'}`;
            row.style.paddingLeft = `${node.depth * 18}px`;

            let badge = '';
            if (node.diffStatus === 'added') badge = '<span class="pjv-diff-tag added">+ ADDED</span>';
            else if (node.diffStatus === 'removed') badge = '<span class="pjv-diff-tag removed">- REMOVED</span>';
            else if (node.diffStatus === 'modified') badge = '<span class="pjv-diff-tag modified">~ MODIFIED</span>';

            let valContent = '';
            if (node.diffStatus === 'modified' && node.oldValue !== undefined) {
              valContent = `
                <span class="pjv-diff-val-old">${escapeHtml(JSON.stringify(node.oldValue))}</span>
                <span class="pjv-diff-arrow">➔</span>
                <span class="pjv-diff-val-new">${escapeHtml(JSON.stringify(node.value))}</span>
              `;
            } else {
              valContent = `<span class="pjv-diff-val">${escapeHtml(JSON.stringify(node.value))}</span>`;
            }

            row.innerHTML = `
              <div class="pjv-diff-row-left">
                ${badge}
                <span class="pjv-diff-key">${escapeHtml(String(node.key ?? 'root'))}:</span>
                ${valContent}
              </div>
              <span class="pjv-diff-path">${escapeHtml(node.path)}</span>
            `;

            treeContent.appendChild(row);
          });
        }
      }

      treeViewWrapper.appendChild(treeContent);
      wrapper.appendChild(treeViewWrapper);

      // Wire Tree Events
      filterBar.querySelector('#pjv-filter-diff-all')?.addEventListener('click', () => { this.diffFilter = 'all'; this.render(); });
      filterBar.querySelector('#pjv-filter-diff-added')?.addEventListener('click', () => { this.diffFilter = 'added'; this.render(); });
      filterBar.querySelector('#pjv-filter-diff-removed')?.addEventListener('click', () => { this.diffFilter = 'removed'; this.render(); });
      filterBar.querySelector('#pjv-filter-diff-modified')?.addEventListener('click', () => { this.diffFilter = 'modified'; this.render(); });

      const searchInput = filterBar.querySelector('#pjv-diff-search-input') as HTMLInputElement;
      searchInput?.addEventListener('input', () => {
        this.searchQuery = searchInput.value.trim();
        this.render();
      });
    }

    this.container.appendChild(wrapper);

    // Wire Global Header Events
    header.querySelector('#pjv-diff-tab-editors')?.addEventListener('click', () => {
      this.activeTab = 'editors';
      this.render();
    });

    header.querySelector('#pjv-diff-tab-tree')?.addEventListener('click', () => {
      this.activeTab = 'tree';
      this.render();
    });

    header.querySelector('#pjv-diff-btn-compare')?.addEventListener('click', () => this.compare());
    header.querySelector('#pjv-diff-btn-format')?.addEventListener('click', () => this.formatBoth());
    header.querySelector('#pjv-diff-btn-swap')?.addEventListener('click', () => this.swapSides());
    header.querySelector('#pjv-diff-btn-sample')?.addEventListener('click', () => this.setSampleData());
    header.querySelector('#pjv-diff-btn-clear')?.addEventListener('click', () => this.clear('right'));
  }
}
