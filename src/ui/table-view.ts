import { copyToClipboard } from '../shared/utils';

export interface TableViewOptions {
  container: HTMLElement;
  data: any;
  scanDepth?: number;
  onCopyToast?: (msg: string) => void;
}

export interface TableTabDataset {
  id: string;
  label: string;
  icon: string;
  type: 'array' | 'summary';
  array: Record<string, any>[];
  count: number;
}

export function extractSummaryMetrics(data: any, currentPath = '$', results: Record<string, any>[] = []): Record<string, any>[] {
  if (!data) return results;

  if (typeof data === 'object' && !Array.isArray(data)) {
    Object.keys(data).forEach((key) => {
      const val = data[key];
      const propPath = currentPath === '$' ? key : `${currentPath}.${key}`;

      if (val === null || val === undefined || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        results.push({ property: propPath, value: val });
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        extractSummaryMetrics(val, propPath, results);
      }
    });
  }

  return results;
}

export function formatTabTitle(path: string, parentObj?: any): { label: string; icon: string } {
  if (path === 'root') return { label: 'Main Data', icon: '📊' };
  if (path === 'summary') return { label: 'Summary Metrics', icon: '📈' };

  const cleanPath = path.replace(/\[\d+\]/g, '');
  const segments = cleanPath.split('.');
  const lastSegment = segments[segments.length - 1] || cleanPath;

  let words = lastSegment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (parentObj && typeof parentObj === 'object') {
    const parentName = parentObj.skill_name || parentObj.name || parentObj.title || parentObj.skill_id;
    if (parentName) {
      words = `${words} (${parentName})`;
    }
  }

  let icon = '📋';
  if (lastSegment.includes('question')) icon = '❓';
  if (lastSegment.includes('skill')) icon = '🎓';
  if (lastSegment.includes('strong') || lastSegment.includes('top')) icon = '🏷️';
  if (lastSegment.includes('weak') || lastSegment.includes('gap')) icon = '⚠️';
  if (lastSegment.includes('department') || lastSegment.includes('map') || lastSegment.includes('org')) icon = '🏢';
  if (lastSegment.includes('user') || lastSegment.includes('people') || lastSegment.includes('employee')) icon = '👥';

  return { label: words, icon };
}

export function findAllArraysOfObjects(data: any, currentPath = '$', results: TableTabDataset[] = [], parentObj?: any, maxDepth = 20): TableTabDataset[] {
  if (!data || maxDepth < 0) return results;

  // Auto-parse stringified JSON
  if (typeof data === 'string' && (data.trim().startsWith('[') || data.trim().startsWith('{'))) {
    try { data = JSON.parse(data); } catch (e) {}
  }

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      const pathStr = currentPath === '$' ? 'root' : currentPath;
      const { label, icon } = formatTabTitle(pathStr, parentObj);
      results.push({
        id: pathStr,
        label,
        icon,
        type: 'array',
        array: data,
        count: data.length
      });
    }
    data.forEach((item, idx) => {
      let parsedItem = item;
      if (typeof item === 'string' && (item.trim().startsWith('{') || item.trim().startsWith('['))) {
        try { parsedItem = JSON.parse(item); } catch (e) {}
      }
      if (typeof parsedItem === 'object' && parsedItem !== null) {
        findAllArraysOfObjects(parsedItem, `${currentPath}[${idx}]`, results, parsedItem, maxDepth - 1);
      }
    });
  } else if (typeof data === 'object' && data !== null) {
    Object.keys(data).forEach((key) => {
      let val = data[key];
      if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
        try { val = JSON.parse(val); } catch (e) {}
      }
      const nextPath = currentPath === '$' ? `$.${key}` : `${currentPath}.${key}`;
      findAllArraysOfObjects(val, nextPath, results, data, maxDepth - 1);
    });
  }

  return results;
}

export class TableView {
  private container: HTMLElement;
  private rawData: any;
  private datasets: TableTabDataset[] = [];
  private activeTabId: string = '';
  private currentArray: Record<string, any>[] = [];
  private columns: string[] = [];
  private sortColumn: string | null = null;
  private sortAsc: boolean = true;
  private searchQuery: string = '';
  private scanDepth: number = 20;
  private onCopyToast?: (msg: string) => void;

  constructor(options: TableViewOptions) {
    this.container = options.container;
    this.rawData = options.data;
    this.scanDepth = options.scanDepth || 20;
    this.onCopyToast = options.onCopyToast;

    this.initDatasets();
    this.render();
  }

  private initDatasets() {
    this.datasets = [];

    // 1. Summary Metrics
    const summaryRows = extractSummaryMetrics(this.rawData);
    if (summaryRows.length > 0) {
      this.datasets.push({
        id: 'summary',
        label: 'Summary Metrics',
        icon: '📈',
        type: 'summary',
        array: summaryRows,
        count: summaryRows.length
      });
    }

    // 2. Scan all arrays with configured scanDepth
    const rawArrays = findAllArraysOfObjects(this.rawData, '$', [], null, this.scanDepth);

    // Deduplicate datasets by ID
    const seenIds = new Set<string>();
    const uniqueArrays: TableTabDataset[] = [];
    rawArrays.forEach((ds) => {
      if (!seenIds.has(ds.id)) {
        seenIds.add(ds.id);
        uniqueArrays.push(ds);
      }
    });

    // 3. Aggregate sub-arrays of questions if any question sub-arrays exist
    const questionDatasets = uniqueArrays.filter((d) => d.id.includes('.questions'));
    if (questionDatasets.length >= 1) {
      const allQuestions: Record<string, any>[] = [];
      questionDatasets.forEach((ds) => {
        const parentMatch = ds.label.match(/\(([^)]+)\)/);
        const parentName = parentMatch ? parentMatch[1] : '';

        ds.array.forEach((q) => {
          allQuestions.push({
            skill: parentName || 'General',
            ...q
          });
        });
      });

      this.datasets.push({
        id: 'all-questions-merged',
        label: 'All Questions',
        icon: '❓',
        type: 'array',
        array: allQuestions,
        count: allQuestions.length
      });
    }

    this.datasets.push(...uniqueArrays);

    if (this.datasets.length > 0) {
      const mergedQuestionsTab = this.datasets.find((d) => d.id === 'all-questions-merged');
      const questionTab = this.datasets.find((d) => d.id.includes('.questions'));
      const firstArrayTab = this.datasets.find((d) => d.type === 'array');

      this.activeTabId = mergedQuestionsTab
        ? mergedQuestionsTab.id
        : (questionTab ? questionTab.id : (firstArrayTab ? firstArrayTab.id : this.datasets[0].id));

      this.loadActiveTab();
    }
  }

  private loadActiveTab() {
    const active = this.datasets.find((d) => d.id === this.activeTabId);
    if (!active) return;

    this.currentArray = active.array;
    this.extractColumns();
    this.sortColumn = null;
    this.sortAsc = true;
  }

  private extractColumns() {
    const keysSet = new Set<string>();
    this.currentArray.forEach((row) => {
      if (typeof row === 'object' && row !== null) {
        Object.keys(row).forEach((k) => keysSet.add(k));
      }
    });
    this.columns = Array.from(keysSet);
  }

  public render() {
    this.container.innerHTML = '';

    if (this.datasets.length === 0) {
      this.container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--pjv-text-muted);">
          <h3 style="margin-top:0; color:var(--pjv-syntax-key);">📊 Table View Unavailable</h3>
          <p style="font-size: 13px; max-width: 420px; margin: 0 auto; line-height: 1.5;">
            No structured datasets or array of objects were detected in this JSON payload.
          </p>
        </div>
      `;
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'pjv-table-container';

    // 1. Dashboard Tab Bar Navigation
    const tabsBar = document.createElement('div');
    tabsBar.className = 'pjv-table-tabs-container';

    this.datasets.forEach((dataset) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `pjv-table-tab ${dataset.id === this.activeTabId ? 'active' : ''}`;
      tabBtn.innerHTML = `
        <span>${dataset.icon}</span>
        <span>${dataset.label}</span>
        <span class="pjv-tab-badge">${dataset.count}</span>
      `;
      tabBtn.onclick = () => {
        this.activeTabId = dataset.id;
        this.loadActiveTab();
        this.render();
      };
      tabsBar.appendChild(tabBtn);
    });
    wrapper.appendChild(tabsBar);

    // 2. Header & Controls Bar
    const header = document.createElement('div');
    header.className = 'pjv-table-header';

    const activeDataset = this.datasets.find((d) => d.id === this.activeTabId)!;
    const meta = document.createElement('div');
    meta.className = 'pjv-table-meta';
    meta.innerHTML = `
      <span>${activeDataset.icon} ${activeDataset.label}</span>
      <span class="pjv-badge-count">${this.getFilteredRows().length} / ${this.currentArray.length} items</span>
    `;

    const controls = document.createElement('div');
    controls.className = 'pjv-table-controls';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Filter rows...';
    searchInput.value = this.searchQuery;
    searchInput.style.cssText = `
      background: var(--pjv-bg-badge);
      color: var(--pjv-text-main);
      border: 1px solid var(--pjv-border-color);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      outline: none;
      width: 160px;
    `;
    searchInput.oninput = () => {
      this.searchQuery = searchInput.value;
      this.updateBody();
    };

    const csvBtn = document.createElement('button');
    csvBtn.className = 'pjv-btn';
    csvBtn.innerHTML = '📥 Export CSV';
    csvBtn.onclick = () => this.exportCsv();

    const depthContainer = document.createElement('div');
    depthContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const depthLabel = document.createElement('span');
    depthLabel.textContent = 'Depth:';
    depthLabel.style.cssText = 'color: var(--pjv-text-muted); font-size: 11px; font-weight: 500;';

    // Magnetic Dot Slider
    const dotSliderWrapper = document.createElement('div');
    dotSliderWrapper.className = 'pjv-magnetic-dot-slider';

    const dotTrack = document.createElement('div');
    dotTrack.className = 'pjv-dot-slider-track';

    const dotElements: HTMLElement[] = [];
    const maxDepthVal = 20;
    for (let i = 1; i <= maxDepthVal; i++) {
      const dot = document.createElement('div');
      dot.className = 'pjv-dot-step';
      if (i <= this.scanDepth) dot.classList.add('active');
      if (i === this.scanDepth) dot.classList.add('current');
      dotTrack.appendChild(dot);
      dotElements.push(dot);
    }

    const rangeInput = document.createElement('input');
    rangeInput.type = 'range';
    rangeInput.min = '1';
    rangeInput.max = String(maxDepthVal);
    rangeInput.step = '1';
    rangeInput.value = String(this.scanDepth);
    rangeInput.className = 'pjv-dot-slider-input';

    const tooltip = document.createElement('div');
    tooltip.className = 'pjv-dot-tooltip';
    tooltip.textContent = `Depth ${this.scanDepth}`;

    dotSliderWrapper.appendChild(dotTrack);
    dotSliderWrapper.appendChild(rangeInput);
    dotSliderWrapper.appendChild(tooltip);

    const updateTooltipPos = (val: number) => {
      const trackWidth = 150; // 170px width - 20px padding
      const posX = 10 + ((val - 1) / (maxDepthVal - 1)) * trackWidth;
      tooltip.style.left = `${posX}px`;
    };
    updateTooltipPos(this.scanDepth);

    dotSliderWrapper.onmousemove = (e) => {
      const rect = dotSliderWrapper.getBoundingClientRect();
      const padding = 10;
      const trackWidth = rect.width - (padding * 2);
      const mouseX = Math.max(0, Math.min(trackWidth, e.clientX - rect.left - padding));
      const pct = trackWidth > 0 ? mouseX / trackWidth : 0;
      const hoverVal = Math.max(1, Math.min(maxDepthVal, Math.round(pct * (maxDepthVal - 1)) + 1));
      tooltip.textContent = `Depth ${hoverVal}`;
      tooltip.style.left = `${padding + ((hoverVal - 1) / (maxDepthVal - 1)) * trackWidth}px`;
    };

    dotSliderWrapper.onmouseleave = () => {
      tooltip.textContent = `Depth ${this.scanDepth}`;
      updateTooltipPos(this.scanDepth);
    };

    const depthBadge = document.createElement('span');
    depthBadge.className = 'pjv-tab-badge';
    depthBadge.textContent = String(this.scanDepth);
    depthBadge.style.cssText = 'font-weight: 600; min-width: 20px; text-align: center;';

    const updateDots = (val: number) => {
      depthBadge.textContent = String(val);
      updateTooltipPos(val);
      dotElements.forEach((dot, idx) => {
        const stepNum = idx + 1;
        dot.classList.toggle('active', stepNum <= val);
        dot.classList.toggle('current', stepNum === val);
      });
    };

    rangeInput.oninput = () => {
      const val = Number(rangeInput.value);
      tooltip.textContent = `Depth ${val}`;
      updateDots(val);
    };

    rangeInput.onchange = () => {
      const val = Number(rangeInput.value);
      this.scanDepth = val;
      this.initDatasets();
      this.render();
      if (this.onCopyToast) this.onCopyToast(`Rescanned datasets at Depth ${this.scanDepth}`);
    };

    depthContainer.appendChild(depthLabel);
    depthContainer.appendChild(dotSliderWrapper);
    depthContainer.appendChild(depthBadge);

    controls.appendChild(searchInput);
    controls.appendChild(depthContainer);
    controls.appendChild(csvBtn);
    header.appendChild(meta);
    header.appendChild(controls);
    wrapper.appendChild(header);

    // 3. Table Content
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'pjv-table-wrapper';

    const table = document.createElement('table');
    table.className = 'pjv-table';

    // Thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const indexTh = document.createElement('th');
    indexTh.textContent = '#';
    indexTh.style.width = '40px';
    headerRow.appendChild(indexTh);

    this.columns.forEach((col) => {
      const th = document.createElement('th');
      th.innerHTML = `${col} <span class="sort-icon">${this.sortColumn === col ? (this.sortAsc ? '▲' : '▼') : '↕'}</span>`;
      if (this.sortColumn === col) th.classList.add('sorted');

      th.onclick = () => {
        if (this.sortColumn === col) {
          if (this.sortAsc) {
            this.sortAsc = false;
          } else {
            this.sortColumn = null;
            this.sortAsc = true;
          }
        } else {
          this.sortColumn = col;
          this.sortAsc = true;
        }
        this.render();
      };
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Tbody
    const tbody = document.createElement('tbody');
    tbody.id = 'pjv-table-tbody';
    table.appendChild(tbody);

    tableWrapper.appendChild(table);
    wrapper.appendChild(tableWrapper);
    this.container.appendChild(wrapper);

    this.updateBody();
  }

  private getFilteredRows(): { row: Record<string, any>; index: number }[] {
    let rows = this.currentArray.map((row, index) => ({ row, index }));

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      rows = rows.filter(({ row }) => {
        return Object.values(row).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    if (this.sortColumn) {
      const col = this.sortColumn;
      const asc = this.sortAsc;
      rows.sort((a, b) => {
        const valA = a.row[col];
        const valB = b.row[col];

        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return asc ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return asc ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return rows;
  }

  private updateBody() {
    const tbody = this.container.querySelector('#pjv-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const filtered = this.getFilteredRows();

    filtered.forEach(({ row, index }) => {
      const tr = document.createElement('tr');

      const tdIndex = document.createElement('td');
      tdIndex.textContent = String(index + 1);
      tdIndex.style.color = 'var(--pjv-text-muted)';
      tr.appendChild(tdIndex);

      this.columns.forEach((col) => {
        const td = document.createElement('td');
        const val = row[col];

        td.innerHTML = this.renderSmartCell(val, col);
        td.title = typeof val === 'object' ? JSON.stringify(val) : String(val);

        const colLower = col.toLowerCase();

        // Single click on sub-array columns (questions, etc) opens matching tab
        if (colLower === 'questions' || colLower === 'skill_levels') {
          td.style.cursor = 'pointer';
          td.onclick = (e) => {
            e.stopPropagation();
            const skillName = row.skill_name || row.skill_id || row.name || row.title;
            const targetDs = this.datasets.find((d) => {
              return d.id.includes(`.${colLower}`) && (skillName ? d.label.includes(skillName) : true);
            }) || this.datasets.find((d) => d.id === 'all-questions-merged');

            if (targetDs) {
              this.activeTabId = targetDs.id;
              this.loadActiveTab();
              this.render();
            }
          };
        }

        td.ondblclick = () => {
          const cellStr = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
          copyToClipboard(cellStr);
          if (this.onCopyToast) this.onCopyToast(`Copied "${cellStr.slice(0, 25)}..."`);
        };

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  private renderSmartCell(val: any, colKey: string): string {
    if (val === null || val === undefined) {
      return `<span class="pjv-table-cell-null">null</span>`;
    }

    if (typeof val === 'boolean') {
      return `<span class="pjv-table-cell-boolean">${val}</span>`;
    }

    const colLower = colKey.toLowerCase();

    // Auto-parse stringified JSON arrays (e.g. questions stored as string)
    let parsedVal = val;
    if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
      try { parsedVal = JSON.parse(val); } catch (e) {}
    }

    // 1. Question Type Badges
    if (colLower === 'type' && typeof val === 'string') {
      if (val === 'single-choice') return `<span class="pjv-pill pjv-type-single">🟢 ${val}</span>`;
      if (val === 'multiple-choice') return `<span class="pjv-pill pjv-type-multiple">🟣 ${val}</span>`;
      if (val === 'dropdown') return `<span class="pjv-pill pjv-type-dropdown">🔵 ${val}</span>`;
      if (val === 'ranking') return `<span class="pjv-pill pjv-type-ranking">🟡 ${val}</span>`;
      return `<span class="pjv-pill pjv-type-text">⚪ ${val}</span>`;
    }

    // 2. Sub-array of Questions badge link
    if ((colLower === 'questions' || colLower === 'skill_levels') && Array.isArray(parsedVal)) {
      return `<span class="pjv-table-cell-json" style="background: var(--pjv-badge-local-bg); color: var(--pjv-badge-local-text); border: 1px solid var(--pjv-badge-local-border); font-weight:600; cursor:pointer;" title="Click to view ${parsedVal.length} ${colKey} in table">❓ ${parsedVal.length} ${colKey} (View)</span>`;
    }

    // 3. Priority Pills
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'low') return `<span class="pjv-pill pjv-pill-low">🟢 Low</span>`;
      if (lower === 'medium') return `<span class="pjv-pill pjv-pill-medium">🟠 Medium</span>`;
      if (lower === 'high' || lower === 'critical') return `<span class="pjv-pill pjv-pill-high">🔴 ${val}</span>`;
    }

    // 4. Expected Answer formatting
    if (colLower === 'expected' && typeof parsedVal === 'object' && parsedVal !== null) {
      if (parsedVal.correct) {
        const correctVal = Array.isArray(parsedVal.correct) ? parsedVal.correct.join(', ') : parsedVal.correct;
        return `<span class="pjv-pill pjv-type-single" style="font-family:var(--pjv-font-mono);">Key: ${correctVal}</span>`;
      }
    }

    // 5. Options Sub-array formatting
    if (colLower === 'options' && Array.isArray(parsedVal)) {
      const optionDetails = parsedVal.map((o: any) => `${o.option || '•'}: ${o.text || ''} (${o.score ?? 0}pt)`).join('\n');
      return `<span class="pjv-table-cell-json" title="${this.escapeHtml(optionDetails)}">📋 ${parsedVal.length} options</span>`;
    }

    // 6. Progress Bar Formatting
    const isProgressCol = colLower.includes('percentage') || colLower.includes('progress') || colLower.includes('coverage');
    if (isProgressCol && typeof val === 'number') {
      const pct = Math.min(100, Math.max(0, val));
      return `
        <div class="pjv-progress-container">
          <div class="pjv-progress-track">
            <div class="pjv-progress-fill" style="width: ${pct}%"></div>
          </div>
          <span style="font-weight:600; font-size:11px;">${val}%</span>
        </div>
      `;
    }

    if (typeof val === 'number') {
      return `<span class="pjv-table-cell-number">${val}</span>`;
    }

    if (typeof val === 'string') {
      const escaped = this.escapeHtml(val);
      const isArabic = /[\u0600-\u06FF]/.test(val);
      if (isArabic) {
        return `<span class="pjv-cell-rtl" dir="rtl">${escaped}</span>`;
      }
      return `<span class="pjv-table-cell-string">${escaped}</span>`;
    }

    const jsonStr = JSON.stringify(val);
    return `<span class="pjv-table-cell-json">${this.escapeHtml(jsonStr)}</span>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private exportCsv() {
    const filtered = this.getFilteredRows();
    if (filtered.length === 0) return;

    const csvRows: string[] = [];
    csvRows.push(this.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(','));

    filtered.forEach(({ row }) => {
      const line = this.columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '""';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',');
      csvRows.push(line);
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pro-json-table-${this.activeTabId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    if (this.onCopyToast) this.onCopyToast('Exported CSV file!');
  }
}
