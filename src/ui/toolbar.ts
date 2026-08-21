import { FilterMode, ViewMode } from '../shared/types';

export interface ToolbarOptions {
  container: HTMLElement;
  currentTheme?: string;
  statsSummary?: string;
  maxDepth?: number;
  onThemeChange?: (theme: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSearchChange: (query: string, mode: FilterMode) => void;
  onExpandDepth: (depth: number) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onCopyAll: () => void;
  onDownload: () => void;
  onOpenDiff: () => void;
  onOpenTools?: (initialTab?: 'ts' | 'zod' | 'yaml' | 'export' | 'analytics' | 'health') => void;
  onOpenShortcuts?: () => void;
  onOpenOptions: () => void;
  onRawFormat?: () => void;
  onRawMinify?: () => void;
  onRawWrapToggle?: (wrap: boolean) => void;
}

export class Toolbar {
  private container: HTMLElement;
  private options: ToolbarOptions;
  private searchInput: HTMLInputElement | null = null;
  private filterSelect: HTMLSelectElement | null = null;
  private setViewFn: ((mode: ViewMode) => void) | null = null;
  private currentMode: ViewMode = 'tree';
  private maxDepth: number = 3;
  private isRawWrapped: boolean = false;

  constructor(options: ToolbarOptions) {
    this.container = options.container;
    this.options = options;
    this.maxDepth = options.maxDepth || 3;
    this.render();
  }

  public focusSearch() {
    if (this.currentMode !== 'tree') {
      this.setViewMode('tree');
    }
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.focus();
        this.searchInput.select();
      }
    }, 50);
  }

  public setViewMode(mode: ViewMode) {
    if (this.setViewFn) {
      this.setViewFn(mode);
    }
  }

  public updateMaxDepth(depth: number) {
    this.maxDepth = Math.max(1, depth);
    if (this.currentMode === 'tree') {
      this.renderSubToolbar('tree');
    }
  }

  public updateStatsSummary(summary: string) {
    const statsBadge = this.container.querySelector('#pjv-badge-stats');
    if (statsBadge) {
      statsBadge.textContent = summary;
    }
  }

  private render() {
    this.container.className = 'pjv-toolbar-wrapper';
    this.container.innerHTML = `
      <!-- Global Topbar (Always Persistent) -->
      <div class="pjv-toolbar-global">
        <div class="pjv-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M8 3H6a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 2 2h2m8-18h2a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-2" />
          </svg>
          Pro JSON
        </div>

        <!-- View Mode Switchers -->
        <div class="pjv-btn-group pjv-view-switchers">
          <button class="pjv-btn active" id="pjv-btn-tree" title="Interactive Tree View (Alt+1)">🌳 Tree</button>
          <button class="pjv-btn" id="pjv-btn-table" title="Relational Table View (Alt+2)">📊 Table</button>
          <button class="pjv-btn" id="pjv-btn-chart" title="Visual Analytics Dashboard (Alt+3)">📈 Chart</button>
          <button class="pjv-btn" id="pjv-btn-diagram" title="Visual Hierarchy Mindmap (Alt+4)">🗺️ Diagram</button>
          <button class="pjv-btn" id="pjv-btn-raw" title="Raw Editor & Formatter (Alt+5)">📝 Raw</button>
          <button class="pjv-btn" id="pjv-btn-diff" title="Structural Diff Mode (Alt+6)">🔀 Diff</button>
        </div>

        <!-- Global Utilities -->
        <div class="pjv-btn-group pjv-global-actions">
          <select id="pjv-toolbar-theme" title="Quick Theme Switcher" class="pjv-select-theme">
            <option value="system">🎨 System</option>
            <option value="dark">🎨 Dark</option>
            <option value="light">🎨 Light</option>
            <option value="dracula">🎨 Dracula</option>
            <option value="onedark">🎨 One Dark</option>
            <option value="monokai">🎨 Monokai</option>
            <option value="nord">🎨 Nord</option>
            <option value="github-dark">🎨 GH Dark</option>
            <option value="github-light">🎨 GH Light</option>
          </select>
          <button class="pjv-btn" id="pjv-btn-tools" title="TypeScript/Zod Schema Generator & Exporter (t)">🛠️ Tools</button>
          <button class="pjv-btn" id="pjv-btn-shortcuts" title="Keyboard Shortcuts Cheatsheet (?)">⌨️</button>
          <button class="pjv-btn" id="pjv-btn-copy" title="Copy formatted JSON">📋 Copy</button>
          <button class="pjv-btn" id="pjv-btn-download" title="Download JSON file">💾 Save</button>
          <button class="pjv-btn" id="pjv-btn-options" title="Extension Settings">⚙️</button>
        </div>

        <!-- Payload Stats & Privacy Badge -->
        <div class="pjv-toolbar-badges">
          ${this.options.statsSummary ? `<div class="pjv-badge-stats" id="pjv-badge-stats" title="Click to view full payload stats & schema">${this.options.statsSummary}</div>` : ''}
          <div class="pjv-badge-local" title="All processing occurs 100% locally in your browser. No telemetry or network calls.">
            <span>🔒</span> 100% Local
          </div>
        </div>
      </div>

      <!-- Contextual Sub-Toolbar (Adapts to Active View) -->
      <div class="pjv-toolbar-sub" id="pjv-toolbar-sub"></div>
    `;

    // Bind Global View Mode Switchers
    const treeBtn = this.container.querySelector('#pjv-btn-tree') as HTMLButtonElement;
    const tableBtn = this.container.querySelector('#pjv-btn-table') as HTMLButtonElement;
    const chartBtn = this.container.querySelector('#pjv-btn-chart') as HTMLButtonElement;
    const diagramBtn = this.container.querySelector('#pjv-btn-diagram') as HTMLButtonElement;
    const rawBtn = this.container.querySelector('#pjv-btn-raw') as HTMLButtonElement;
    const diffBtn = this.container.querySelector('#pjv-btn-diff') as HTMLButtonElement;

    const setView = (mode: ViewMode) => {
      this.currentMode = mode;
      [treeBtn, tableBtn, chartBtn, diagramBtn, rawBtn, diffBtn].forEach((btn) => btn?.classList.remove('active'));
      if (mode === 'tree') treeBtn?.classList.add('active');
      if (mode === 'table') tableBtn?.classList.add('active');
      if (mode === 'chart') chartBtn?.classList.add('active');
      if (mode === 'diagram') diagramBtn?.classList.add('active');
      if (mode === 'raw') rawBtn?.classList.add('active');
      if (mode === 'diff') diffBtn?.classList.add('active');

      this.renderSubToolbar(mode);
      this.options.onViewModeChange(mode);
    };
    this.setViewFn = setView;

    treeBtn.onclick = () => setView('tree');
    tableBtn.onclick = () => setView('table');
    chartBtn.onclick = () => setView('chart');
    diagramBtn.onclick = () => setView('diagram');
    rawBtn.onclick = () => setView('raw');
    diffBtn.onclick = () => {
      setView('diff');
      this.options.onOpenDiff();
    };

    // Bind Global Actions
    const toolsBtn = this.container.querySelector('#pjv-btn-tools');
    if (toolsBtn && this.options.onOpenTools) {
      toolsBtn.addEventListener('click', () => this.options.onOpenTools!('ts'));
    }

    const shortcutsBtn = this.container.querySelector('#pjv-btn-shortcuts');
    if (shortcutsBtn && this.options.onOpenShortcuts) {
      shortcutsBtn.addEventListener('click', () => this.options.onOpenShortcuts!());
    }

    const statsBadge = this.container.querySelector('#pjv-badge-stats');
    if (statsBadge && this.options.onOpenTools) {
      statsBadge.addEventListener('click', () => this.options.onOpenTools!('analytics'));
    }

    this.container.querySelector('#pjv-btn-copy')!.addEventListener('click', () => this.options.onCopyAll());
    this.container.querySelector('#pjv-btn-download')!.addEventListener('click', () => this.options.onDownload());
    this.container.querySelector('#pjv-btn-options')!.addEventListener('click', () => this.options.onOpenOptions());

    const themeSelect = this.container.querySelector('#pjv-toolbar-theme') as HTMLSelectElement;
    if (this.options.currentTheme) themeSelect.value = this.options.currentTheme;
    themeSelect.onchange = () => {
      if (this.options.onThemeChange) this.options.onThemeChange(themeSelect.value);
    };

    // Initial Contextual Sub-Toolbar Render
    this.renderSubToolbar('tree');
  }

  private renderSubToolbar(mode: ViewMode) {
    const sub = this.container.querySelector('#pjv-toolbar-sub') as HTMLElement;
    if (!sub) return;

    if (mode === 'tree') {
      const maxButtons = Math.min(Math.max(2, this.maxDepth), 6);
      let depthButtonsHtml = '';
      for (let d = 1; d <= maxButtons; d++) {
        depthButtonsHtml += `<button class="pjv-btn" id="pjv-btn-depth-${d}" title="Expand to Depth ${d}">D${d}</button>`;
      }

      sub.innerHTML = `
        <div class="pjv-sub-left">
          <!-- Search Input & Mode -->
          <div class="pjv-search-box">
            <input type="text" id="pjv-search-input" placeholder="Search keys, values, or JSONPath (e.g. $.users[0])... [/]" />
            <select id="pjv-filter-mode" class="pjv-filter-mode-select">
              <option value="text">Text</option>
              <option value="regex">Regex</option>
              <option value="jsonpath">JSONPath</option>
            </select>
          </div>
        </div>

        <div class="pjv-sub-right">
          <!-- Dynamic Depth Buttons & Expand Controls -->
          <div class="pjv-btn-group pjv-depth-group">
            <span class="pjv-sub-label">Depth:</span>
            ${depthButtonsHtml}
            <button class="pjv-btn" id="pjv-btn-expand-all" title="Expand All (e)">Expand All</button>
            <button class="pjv-btn" id="pjv-btn-collapse-all" title="Collapse All (c)">Collapse All</button>
          </div>
        </div>
      `;

      // Wire search inputs
      this.searchInput = sub.querySelector('#pjv-search-input') as HTMLInputElement;
      this.filterSelect = sub.querySelector('#pjv-filter-mode') as HTMLSelectElement;

      const emitSearch = () => {
        if (this.searchInput && this.filterSelect) {
          this.options.onSearchChange(this.searchInput.value, this.filterSelect.value as FilterMode);
        }
      };

      this.searchInput.oninput = emitSearch;
      this.filterSelect.onchange = emitSearch;

      // Wire depth buttons
      for (let d = 1; d <= maxButtons; d++) {
        const btn = sub.querySelector(`#pjv-btn-depth-${d}`);
        btn?.addEventListener('click', () => this.options.onExpandDepth(d));
      }

      sub.querySelector('#pjv-btn-expand-all')?.addEventListener('click', () => this.options.onExpandAll());
      sub.querySelector('#pjv-btn-collapse-all')?.addEventListener('click', () => this.options.onCollapseAll());

    } else if (mode === 'raw') {
      sub.innerHTML = `
        <div class="pjv-sub-left">
          <div class="pjv-sub-hint">
            <span>📝</span> Raw JSON Editor • Edit or paste payloads to re-sync across all views
          </div>
        </div>

        <div class="pjv-sub-right">
          <div class="pjv-btn-group">
            <button class="pjv-btn" id="pjv-btn-raw-format" title="Beautify and format JSON with 2 spaces">✨ Beautify</button>
            <button class="pjv-btn" id="pjv-btn-raw-minify" title="Minify into compact single-line JSON">📦 Minify</button>
            <button class="pjv-btn ${this.isRawWrapped ? 'active' : ''}" id="pjv-btn-raw-wrap" title="Toggle line wrapping in editor">↩️ Wrap Lines</button>
          </div>
        </div>
      `;

      sub.querySelector('#pjv-btn-raw-format')?.addEventListener('click', () => {
        if (this.options.onRawFormat) this.options.onRawFormat();
      });

      sub.querySelector('#pjv-btn-raw-minify')?.addEventListener('click', () => {
        if (this.options.onRawMinify) this.options.onRawMinify();
      });

      const wrapBtn = sub.querySelector('#pjv-btn-raw-wrap') as HTMLButtonElement;
      wrapBtn?.addEventListener('click', () => {
        this.isRawWrapped = !this.isRawWrapped;
        wrapBtn.classList.toggle('active', this.isRawWrapped);
        if (this.options.onRawWrapToggle) this.options.onRawWrapToggle(this.isRawWrapped);
      });

    } else if (mode === 'table') {
      sub.innerHTML = `
        <div class="pjv-sub-left">
          <div class="pjv-sub-hint">
            <span>📊</span> Tabular Data Dashboard • Click column headers to sort • Use nested badges to inspect sub-arrays
          </div>
        </div>
        <div class="pjv-sub-right"></div>
      `;
    } else if (mode === 'chart') {
      sub.innerHTML = `
        <div class="pjv-sub-left">
          <div class="pjv-sub-hint">
            <span>📈</span> Visual Chart Analytics • Donut, Vertical Bar & Horizontal Bar charts with Top-N filtering
          </div>
        </div>
        <div class="pjv-sub-right"></div>
      `;
    } else if (mode === 'diagram') {
      sub.innerHTML = `
        <div class="pjv-sub-left">
          <div class="pjv-sub-hint">
            <span>🗺️</span> Interactive Hierarchy Graph • Scroll to Zoom • Drag canvas to Pan • Click nodes to expand
          </div>
        </div>
        <div class="pjv-sub-right"></div>
      `;
    } else if (mode === 'diff') {
      sub.innerHTML = `
        <div class="pjv-sub-left">
          <div class="pjv-sub-hint">
            <span>🔀</span> Structural Payload Comparison • Highlighting added, removed, and modified properties
          </div>
        </div>
        <div class="pjv-sub-right"></div>
      `;
    }
  }
}
