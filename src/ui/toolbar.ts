import { FilterMode, ViewMode } from '../shared/types';

export interface ToolbarOptions {
  container: HTMLElement;
  currentTheme?: string;
  statsSummary?: string;
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
}

export class Toolbar {
  private container: HTMLElement;
  private searchInput: HTMLInputElement | null = null;
  private setViewFn: ((mode: ViewMode) => void) | null = null;

  constructor(options: ToolbarOptions) {
    this.container = options.container;
    this.render(options);
  }

  public focusSearch() {
    if (this.searchInput) {
      this.searchInput.focus();
      this.searchInput.select();
    }
  }

  public setViewMode(mode: ViewMode) {
    if (this.setViewFn) {
      this.setViewFn(mode);
    }
  }

  private render(opts: ToolbarOptions) {
    this.container.className = 'pjv-toolbar';
    this.container.innerHTML = `
      <div class="pjv-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M8 3H6a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 0 2 2h2m8-18h2a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-2" />
        </svg>
        Pro JSON
      </div>

      <!-- View Mode Buttons -->
      <div class="pjv-btn-group">
        <button class="pjv-btn active" id="pjv-btn-tree" title="Tree View (Alt+1)">Tree</button>
        <button class="pjv-btn" id="pjv-btn-table" title="Table View (Alt+2)">Table</button>
        <button class="pjv-btn" id="pjv-btn-chart" title="Chart View (Alt+3)">Chart 📊</button>
        <button class="pjv-btn" id="pjv-btn-diagram" title="Diagram View (Alt+4)">Diagram 🗺️</button>
        <button class="pjv-btn" id="pjv-btn-raw" title="Raw View (Alt+5)">Raw</button>
        <button class="pjv-btn" id="pjv-btn-diff" title="Diff Mode (Alt+6)">Diff</button>
      </div>

      <!-- Search Input & Mode -->
      <div class="pjv-search-box">
        <input type="text" id="pjv-search-input" placeholder="Search keys, values, or JSONPath (e.g. $.users[0])... [/]" />
        <select id="pjv-filter-mode" style="background:transparent; border:none; color:var(--pjv-text-muted); font-size:11px; cursor:pointer;">
          <option value="text">Text</option>
          <option value="regex">Regex</option>
          <option value="jsonpath">JSONPath</option>
        </select>
      </div>

      <!-- Depth Buttons -->
      <div class="pjv-btn-group">
        <button class="pjv-btn" id="pjv-btn-depth-1">D1</button>
        <button class="pjv-btn" id="pjv-btn-depth-2">D2</button>
        <button class="pjv-btn" id="pjv-btn-depth-3">D3</button>
        <button class="pjv-btn" id="pjv-btn-expand-all" title="Expand All (e)">Expand</button>
        <button class="pjv-btn" id="pjv-btn-collapse-all" title="Collapse All (c)">Collapse</button>
      </div>

      <!-- Actions, Tools & Theme Quick Switcher -->
      <div class="pjv-btn-group">
        <select id="pjv-toolbar-theme" title="Quick Theme Switcher" style="background:transparent; border:none; color:var(--pjv-text-muted); font-size:11px; cursor:pointer; padding:4px 6px;">
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
        <button class="pjv-btn" id="pjv-btn-copy" title="Copy formatted JSON">Copy</button>
        <button class="pjv-btn" id="pjv-btn-download" title="Download JSON file">Save</button>
        <button class="pjv-btn" id="pjv-btn-options" title="Extension Settings">⚙️</button>
      </div>

      <!-- Payload Stats & Privacy Badge -->
      ${opts.statsSummary ? `<div class="pjv-badge-stats" id="pjv-badge-stats" title="Click to view full payload stats & schema">${opts.statsSummary}</div>` : ''}

      <div class="pjv-badge-local" title="All processing occurs 100% locally in your browser. No telemetry or network calls.">
        <span>🔒</span> 100% Local
      </div>
    `;

    // Event Bindings
    const treeBtn = this.container.querySelector('#pjv-btn-tree') as HTMLButtonElement;
    const tableBtn = this.container.querySelector('#pjv-btn-table') as HTMLButtonElement;
    const chartBtn = this.container.querySelector('#pjv-btn-chart') as HTMLButtonElement;
    const diagramBtn = this.container.querySelector('#pjv-btn-diagram') as HTMLButtonElement;
    const rawBtn = this.container.querySelector('#pjv-btn-raw') as HTMLButtonElement;
    const diffBtn = this.container.querySelector('#pjv-btn-diff') as HTMLButtonElement;

    const setView = (mode: ViewMode) => {
      [treeBtn, tableBtn, chartBtn, diagramBtn, rawBtn, diffBtn].forEach((btn) => btn.classList.remove('active'));
      if (mode === 'tree') treeBtn.classList.add('active');
      if (mode === 'table') tableBtn.classList.add('active');
      if (mode === 'chart') chartBtn.classList.add('active');
      if (mode === 'diagram') diagramBtn.classList.add('active');
      if (mode === 'raw') rawBtn.classList.add('active');
      if (mode === 'diff') diffBtn.classList.add('active');
      opts.onViewModeChange(mode);
    };
    this.setViewFn = setView;

    treeBtn.onclick = () => setView('tree');
    tableBtn.onclick = () => setView('table');
    chartBtn.onclick = () => setView('chart');
    diagramBtn.onclick = () => setView('diagram');
    rawBtn.onclick = () => setView('raw');
    diffBtn.onclick = () => {
      setView('diff');
      opts.onOpenDiff();
    };

    this.searchInput = this.container.querySelector('#pjv-search-input') as HTMLInputElement;
    const filterSelect = this.container.querySelector('#pjv-filter-mode') as HTMLSelectElement;

    const emitSearch = () => {
      if (this.searchInput) {
        opts.onSearchChange(this.searchInput.value, filterSelect.value as FilterMode);
      }
    };

    this.searchInput.oninput = emitSearch;
    filterSelect.onchange = emitSearch;

    this.container.querySelector('#pjv-btn-depth-1')!.addEventListener('click', () => opts.onExpandDepth(1));
    this.container.querySelector('#pjv-btn-depth-2')!.addEventListener('click', () => opts.onExpandDepth(2));
    this.container.querySelector('#pjv-btn-depth-3')!.addEventListener('click', () => opts.onExpandDepth(3));
    this.container.querySelector('#pjv-btn-expand-all')!.addEventListener('click', () => opts.onExpandAll());
    this.container.querySelector('#pjv-btn-collapse-all')!.addEventListener('click', () => opts.onCollapseAll());

    const toolsBtn = this.container.querySelector('#pjv-btn-tools');
    if (toolsBtn && opts.onOpenTools) {
      toolsBtn.addEventListener('click', () => opts.onOpenTools!('ts'));
    }

    const shortcutsBtn = this.container.querySelector('#pjv-btn-shortcuts');
    if (shortcutsBtn && opts.onOpenShortcuts) {
      shortcutsBtn.addEventListener('click', () => opts.onOpenShortcuts!());
    }

    const statsBadge = this.container.querySelector('#pjv-badge-stats');
    if (statsBadge && opts.onOpenTools) {
      statsBadge.addEventListener('click', () => opts.onOpenTools!('analytics'));
    }

    this.container.querySelector('#pjv-btn-copy')!.addEventListener('click', () => opts.onCopyAll());
    this.container.querySelector('#pjv-btn-download')!.addEventListener('click', () => opts.onDownload());
    this.container.querySelector('#pjv-btn-options')!.addEventListener('click', () => opts.onOpenOptions());

    const themeSelect = this.container.querySelector('#pjv-toolbar-theme') as HTMLSelectElement;
    if (opts.currentTheme) themeSelect.value = opts.currentTheme;
    themeSelect.onchange = () => {
      if (opts.onThemeChange) opts.onThemeChange(themeSelect.value);
    };
  }
}

