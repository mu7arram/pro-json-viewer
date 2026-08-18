export interface ChartViewOptions {
  container: HTMLElement;
  data: any;
  scanDepth?: number;
  onToast?: (msg: string) => void;
}

export interface ChartTabDataset {
  id: string;
  label: string;
  icon: string;
  type: 'array' | 'breakdown' | 'kpis';
  array?: Record<string, any>[];
  breakdown?: { label: string; value: number }[];
  kpis?: { label: string; value: number | string }[];
  stringKeys?: string[];
  numericKeys?: string[];
}

const PALETTE = [
  '#0284c7', // Sky Blue
  '#22c55e', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#6366f1'  // Indigo
];

export function formatNumericValue(val: number): string {
  if (isNaN(val) || !isFinite(val)) return '0';
  if (Number.isInteger(val)) return String(val);
  return Number(val.toFixed(2)).toString();
}

export function isIdField(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === 'id' ||
    k.endsWith('_id') ||
    k.endsWith('id') ||
    k.includes('_code') ||
    k === 'code' ||
    k.includes('status_code') ||
    k.includes('created_at') ||
    k.includes('updated_at') ||
    k.includes('timestamp') ||
    k.includes('version') ||
    k === 'v' ||
    k === '_v'
  );
}

export function formatChartTitle(path: string, parentObj?: any): { label: string; icon: string } {
  if (path === 'root') return { label: 'Main Series', icon: '📊' };

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

  let icon = '📊';
  if (lastSegment.includes('question')) icon = '❓';
  if (lastSegment.includes('skill')) icon = '🎓';
  if (lastSegment.includes('strong') || lastSegment.includes('top')) icon = '🏷️';
  if (lastSegment.includes('weak') || lastSegment.includes('gap')) icon = '⚠️';
  if (lastSegment.includes('department') || lastSegment.includes('map') || lastSegment.includes('org')) icon = '🏢';
  if (lastSegment.includes('breakdown') || lastSegment.includes('stats')) icon = '🍩';
  if (lastSegment.includes('user') || lastSegment.includes('people') || lastSegment.includes('assignment')) icon = '📋';

  return { label: words, icon };
}

export function discoverChartDatasets(data: any, currentPath = '$', results: ChartTabDataset[] = [], parentObj?: any, maxDepth = 3): ChartTabDataset[] {
  if (!data || maxDepth < 0) return results;

  if (typeof data === 'string' && (data.trim().startsWith('[') || data.trim().startsWith('{'))) {
    try { data = JSON.parse(data); } catch (e) {}
  }

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      const sample = data[0];
      const allKeys = Object.keys(sample);
      const stringKeys = allKeys.filter((k) => typeof sample[k] === 'string' || typeof sample[k] === 'number');
      const numericKeys = allKeys.filter((k) => typeof sample[k] === 'number' && !isIdField(k));

      if (numericKeys.length > 0 || stringKeys.length > 0) {
        const pathStr = currentPath === '$' ? 'root' : currentPath;
        const { label, icon } = formatChartTitle(pathStr, parentObj);

        results.push({
          id: pathStr,
          label: `${label} (${data.length})`,
          icon,
          type: 'array',
          array: data,
          stringKeys,
          numericKeys
        });
      }
    }

    data.forEach((item, idx) => {
      let parsedItem = item;
      if (typeof item === 'string' && (item.trim().startsWith('{') || item.trim().startsWith('['))) {
        try { parsedItem = JSON.parse(item); } catch (e) {}
      }
      if (typeof parsedItem === 'object' && parsedItem !== null) {
        discoverChartDatasets(parsedItem, `${currentPath}[${idx}]`, results, parsedItem, maxDepth - 1);
      }
    });
  } else if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    const isNumericBreakdown = keys.length >= 2 && keys.every((k) => typeof data[k] === 'number' && !isIdField(k));

    if (isNumericBreakdown) {
      const pathStr = currentPath === '$' ? 'breakdown' : currentPath;
      const { label, icon } = formatChartTitle(pathStr, parentObj);
      results.push({
        id: pathStr,
        label,
        icon,
        type: 'breakdown',
        breakdown: keys.map((k) => ({ label: k.replace(/_/g, ' '), value: data[k] }))
      });
    } else {
      keys.forEach((key) => {
        let val = data[key];
        if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
          try { val = JSON.parse(val); } catch (e) {}
        }
        const nextPath = currentPath === '$' ? `$.${key}` : `${currentPath}.${key}`;
        discoverChartDatasets(val, nextPath, results, data, maxDepth - 1);
      });
    }
  }

  return results;
}

export function extractNonIdKpis(data: any, currentPath = '$', results: { label: string; value: number | string }[] = []): { label: string; value: number | string }[] {
  if (!data || typeof data !== 'object') return results;

  if (!Array.isArray(data)) {
    Object.keys(data).forEach((key) => {
      const val = data[key];
      const propPath = currentPath === '$' ? key : `${currentPath}.${key}`;

      if (!isIdField(key)) {
        if (typeof val === 'number') {
          results.push({ label: key.replace(/_/g, ' '), value: formatNumericValue(val) });
        } else if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '' && val.length <= 10) {
          results.push({ label: key.replace(/_/g, ' '), value: formatNumericValue(Number(val)) });
        } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          extractNonIdKpis(val, propPath, results);
        }
      }
    });
  }

  return results;
}

export class ChartView {
  private container: HTMLElement;
  private rawData: any;
  private scanDepth: number;
  private onToast?: (msg: string) => void;
  private datasets: ChartTabDataset[] = [];
  private activeTabId: string = '';
  private selectedChartType: 'donut' | 'vbar' | 'hbar' = 'vbar';
  private selectedLabelKey: string = '';
  private selectedValueKey: string = '';
  private aggregationMode: 'raw' | 'count' = 'raw';
  private topNLimit: number = 0;

  constructor(options: ChartViewOptions) {
    this.container = options.container;
    this.rawData = options.data;
    this.scanDepth = options.scanDepth || 3;
    this.onToast = options.onToast;

    this.initDatasets();
    this.render();
  }

  private initDatasets() {
    this.datasets = [];

    const kpiMetrics = extractNonIdKpis(this.rawData);
    if (kpiMetrics.length > 0) {
      this.datasets.push({
        id: 'summary-kpis',
        label: 'Summary Metrics',
        icon: '📈',
        type: 'kpis',
        kpis: kpiMetrics.slice(0, 12)
      });
    }

    const discovered = discoverChartDatasets(this.rawData, '$', [], null, this.scanDepth);
    const seenIds = new Set<string>();
    discovered.forEach((ds) => {
      if (!seenIds.has(ds.id)) {
        seenIds.add(ds.id);
        this.datasets.push(ds);
      }
    });

    if (this.datasets.length > 0) {
      const firstArrayOrBreakdown = this.datasets.find((d) => d.type === 'array' || d.type === 'breakdown');
      this.activeTabId = firstArrayOrBreakdown ? firstArrayOrBreakdown.id : this.datasets[0].id;
      this.configureTabDefaults();
    }
  }

  private configureTabDefaults() {
    const active = this.datasets.find((d) => d.id === this.activeTabId);
    if (!active) return;

    if (active.type === 'array' && active.array && active.array.length > 0) {
      const strKeys = active.stringKeys || Object.keys(active.array[0]);
      const numKeys = active.numericKeys || Object.keys(active.array[0]).filter((k) => typeof active.array![0][k] === 'number' && !isIdField(k));

      this.selectedLabelKey = strKeys.find((k) => !isIdField(k) && typeof active.array![0][k] === 'string') || strKeys[0] || '';
      this.selectedValueKey = numKeys[0] || strKeys.find((k) => !isIdField(k) && typeof active.array![0][k] === 'number') || '';
      this.aggregationMode = numKeys.length > 0 ? 'raw' : 'count';
      this.selectedChartType = 'vbar';
      this.topNLimit = 0;
    } else if (active.type === 'breakdown') {
      this.selectedChartType = 'donut';
    }
  }

  private buildMagneticSlider(): HTMLElement {
    const depthContainer = document.createElement('div');
    depthContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--pjv-text-muted);';

    const depthLabel = document.createElement('span');
    depthLabel.innerHTML = `Depth: <strong style="color:var(--pjv-syntax-key);">${this.scanDepth}</strong>`;
    depthContainer.appendChild(depthLabel);

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
      const pct = (val - 1) / (maxDepthVal - 1);
      const leftPx = pct * 170;
      tooltip.style.left = `${leftPx}px`;
      tooltip.textContent = `Depth ${val}`;
    };

    updateTooltipPos(this.scanDepth);

    rangeInput.onmouseenter = () => tooltip.classList.add('show');
    rangeInput.onmouseleave = () => tooltip.classList.remove('show');
    rangeInput.oninput = () => {
      const val = parseInt(rangeInput.value, 10);
      updateTooltipPos(val);
      dotElements.forEach((dot, idx) => {
        const stepNum = idx + 1;
        dot.classList.toggle('active', stepNum <= val);
        dot.classList.toggle('current', stepNum === val);
      });
    };
    rangeInput.onchange = () => {
      const val = parseInt(rangeInput.value, 10);
      this.scanDepth = val;
      this.initDatasets();
      this.render();
    };

    depthContainer.appendChild(dotSliderWrapper);
    return depthContainer;
  }

  public render() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'pjv-chart-container';

    // 1. Header Bar with Tabs & Magnetic Slider (ALWAYS rendered!)
    const headerBar = document.createElement('div');
    headerBar.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid var(--pjv-border-color); padding-bottom: 10px;';

    const tabsBar = document.createElement('div');
    tabsBar.className = 'pjv-table-tabs-container';
    tabsBar.style.margin = '0';

    if (this.datasets.length > 0) {
      this.datasets.forEach((dataset) => {
        const tabBtn = document.createElement('button');
        tabBtn.className = `pjv-table-tab ${dataset.id === this.activeTabId ? 'active' : ''}`;
        const countLabel = dataset.array ? dataset.array.length : (dataset.breakdown ? dataset.breakdown.length : (dataset.kpis ? dataset.kpis.length : 0));
        tabBtn.innerHTML = `
          <span>${dataset.icon}</span>
          <span>${dataset.label}</span>
          <span class="pjv-tab-badge">${countLabel}</span>
        `;
        tabBtn.onclick = () => {
          this.activeTabId = dataset.id;
          this.configureTabDefaults();
          this.render();
        };
        tabsBar.appendChild(tabBtn);
      });
    } else {
      const emptyTab = document.createElement('div');
      emptyTab.style.cssText = 'font-size: 12px; color: var(--pjv-text-muted); font-weight: 500;';
      emptyTab.textContent = '📈 No chartable datasets at current depth';
      tabsBar.appendChild(emptyTab);
    }

    headerBar.appendChild(tabsBar);
    headerBar.appendChild(this.buildMagneticSlider());
    wrapper.appendChild(headerBar);

    // Empty state handling
    if (this.datasets.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = 'padding: 40px; text-align: center; color: var(--pjv-text-muted);';
      emptyState.innerHTML = `
        <h3 style="margin-top:0; color:var(--pjv-syntax-key);">📈 Chart View Unavailable</h3>
        <p style="font-size: 13px; max-width: 460px; margin: 0 auto; line-height: 1.5;">
          No numeric metrics, categorical breakdowns, or chartable series were detected in this JSON payload at <strong>Scan Depth ${this.scanDepth}</strong>.
          <br><br>
          👉 Use the <strong>Scan Depth slider</strong> above to scan deeper (e.g. Depth 5 to 20).
        </p>
      `;
      wrapper.appendChild(emptyState);
      this.container.appendChild(wrapper);
      return;
    }

    const activeDataset = this.datasets.find((d) => d.id === this.activeTabId)!;

    // 2. Interactive Controls Bar (for array datasets)
    if (activeDataset.type === 'array' && activeDataset.array) {
      const controlsBar = document.createElement('div');
      controlsBar.className = 'pjv-table-header';
      controlsBar.style.cssText = 'padding: 10px 14px; background: var(--pjv-bg-badge); border-radius: 8px; border: 1px solid var(--pjv-border-color); margin: 10px 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;';

      const leftGroup = document.createElement('div');
      leftGroup.style.cssText = 'display: flex; align-items: center; gap: 12px; font-size: 12px; flex-wrap: wrap;';

      // Aggregation Mode Switcher
      const modeSelect = document.createElement('select');
      modeSelect.style.cssText = 'background: var(--pjv-bg-main); color: var(--pjv-text-main); border: 1px solid var(--pjv-border-color); border-radius: 4px; padding: 4px 8px; font-size: 11px; outline: none; cursor: pointer; font-weight: 600;';
      modeSelect.innerHTML = `
        <option value="raw" ${this.aggregationMode === 'raw' ? 'selected' : ''}>Plot Numeric Values</option>
        <option value="count" ${this.aggregationMode === 'count' ? 'selected' : ''}>Count by Category</option>
      `;
      modeSelect.onchange = () => {
        this.aggregationMode = modeSelect.value as any;
        this.render();
      };
      leftGroup.appendChild(modeSelect);

      // Label Selector
      const labelGroup = document.createElement('div');
      labelGroup.innerHTML = `<span style="color:var(--pjv-text-muted); font-weight:500; margin-right:4px;">Label:</span>`;
      const labelSelect = document.createElement('select');
      labelSelect.style.cssText = 'background: var(--pjv-bg-main); color: var(--pjv-text-main); border: 1px solid var(--pjv-border-color); border-radius: 4px; padding: 4px 8px; font-size: 11px; outline: none; cursor: pointer;';
      (activeDataset.stringKeys || []).forEach((k) => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k + (isIdField(k) ? ' (ID)' : '');
        if (k === this.selectedLabelKey) opt.selected = true;
        labelSelect.appendChild(opt);
      });
      labelSelect.onchange = () => {
        this.selectedLabelKey = labelSelect.value;
        this.renderChartBody(chartDisplayArea, activeDataset);
      };
      labelGroup.appendChild(labelSelect);

      // Value Selector (only if Raw Values mode)
      if (this.aggregationMode === 'raw') {
        const valueGroup = document.createElement('div');
        valueGroup.innerHTML = `<span style="color:var(--pjv-text-muted); font-weight:500; margin-right:4px;">Value:</span>`;
        const valueSelect = document.createElement('select');
        valueSelect.style.cssText = 'background: var(--pjv-bg-main); color: var(--pjv-text-main); border: 1px solid var(--pjv-border-color); border-radius: 4px; padding: 4px 8px; font-size: 11px; outline: none; cursor: pointer;';
        (activeDataset.numericKeys || activeDataset.stringKeys || []).forEach((k) => {
          if (!isIdField(k)) {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            if (k === this.selectedValueKey) opt.selected = true;
            valueSelect.appendChild(opt);
          }
        });
        valueSelect.onchange = () => {
          this.selectedValueKey = valueSelect.value;
          this.renderChartBody(chartDisplayArea, activeDataset);
        };
        valueGroup.appendChild(valueSelect);
        leftGroup.appendChild(valueGroup);
      }

      // Top-N Selector
      const topNGroup = document.createElement('div');
      topNGroup.innerHTML = `<span style="color:var(--pjv-text-muted); font-weight:500; margin-right:4px;">Show:</span>`;
      const topNSelect = document.createElement('select');
      topNSelect.style.cssText = 'background: var(--pjv-bg-main); color: var(--pjv-text-main); border: 1px solid var(--pjv-border-color); border-radius: 4px; padding: 4px 8px; font-size: 11px; outline: none; cursor: pointer;';
      [0, 5, 10, 20].forEach((n) => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = n === 0 ? 'All Items' : `Top ${n}`;
        if (n === this.topNLimit) opt.selected = true;
        topNSelect.appendChild(opt);
      });
      topNSelect.onchange = () => {
        this.topNLimit = Number(topNSelect.value);
        this.renderChartBody(chartDisplayArea, activeDataset);
      };
      topNGroup.appendChild(topNSelect);

      leftGroup.appendChild(labelGroup);
      leftGroup.appendChild(topNGroup);

      // Chart Type Switcher
      const typeBtnGroup = document.createElement('div');
      typeBtnGroup.className = 'pjv-btn-group';

      const donutBtn = document.createElement('button');
      donutBtn.className = `pjv-btn ${this.selectedChartType === 'donut' ? 'active' : ''}`;
      donutBtn.textContent = '🍩 Donut';
      donutBtn.onclick = () => {
        this.selectedChartType = 'donut';
        this.updateTypeButtons(typeBtnGroup, donutBtn);
        this.renderChartBody(chartDisplayArea, activeDataset);
      };

      const vbarBtn = document.createElement('button');
      vbarBtn.className = `pjv-btn ${this.selectedChartType === 'vbar' ? 'active' : ''}`;
      vbarBtn.textContent = '📊 Vertical';
      vbarBtn.onclick = () => {
        this.selectedChartType = 'vbar';
        this.updateTypeButtons(typeBtnGroup, vbarBtn);
        this.renderChartBody(chartDisplayArea, activeDataset);
      };

      const hbarBtn = document.createElement('button');
      hbarBtn.className = `pjv-btn ${this.selectedChartType === 'hbar' ? 'active' : ''}`;
      hbarBtn.textContent = '📈 Horizontal';
      hbarBtn.onclick = () => {
        this.selectedChartType = 'hbar';
        this.updateTypeButtons(typeBtnGroup, hbarBtn);
        this.renderChartBody(chartDisplayArea, activeDataset);
      };

      typeBtnGroup.appendChild(donutBtn);
      typeBtnGroup.appendChild(vbarBtn);
      typeBtnGroup.appendChild(hbarBtn);

      // Export Action Buttons Group
      const exportGroup = document.createElement('div');
      exportGroup.className = 'pjv-btn-group';

      const copyImgBtn = document.createElement('button');
      copyImgBtn.className = 'pjv-btn';
      copyImgBtn.title = 'Copy Chart Image to Clipboard';
      copyImgBtn.textContent = '📋 Copy';
      copyImgBtn.onclick = () => this.copyImageToClipboard(activeDataset);

      const expPngBtn = document.createElement('button');
      expPngBtn.className = 'pjv-btn active';
      expPngBtn.title = 'Download High-Res PNG Image';
      expPngBtn.textContent = '📷 PNG';
      expPngBtn.onclick = () => this.exportPng(activeDataset);

      const expSvgBtn = document.createElement('button');
      expSvgBtn.className = 'pjv-btn';
      expSvgBtn.title = 'Download Vector SVG';
      expSvgBtn.textContent = '📥 SVG';
      expSvgBtn.onclick = () => this.exportSvg(activeDataset);

      exportGroup.appendChild(copyImgBtn);
      exportGroup.appendChild(expPngBtn);
      exportGroup.appendChild(expSvgBtn);

      const rightControls = document.createElement('div');
      rightControls.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';
      rightControls.appendChild(typeBtnGroup);
      rightControls.appendChild(exportGroup);

      controlsBar.appendChild(leftGroup);
      controlsBar.appendChild(rightControls);
      wrapper.appendChild(controlsBar);
    } else if (activeDataset.type === 'breakdown') {
      const controlsBar = document.createElement('div');
      controlsBar.className = 'pjv-table-header';
      controlsBar.style.cssText = 'padding: 8px 14px; background: var(--pjv-bg-badge); border-radius: 8px; border: 1px solid var(--pjv-border-color); margin: 10px 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px;';

      const exportGroup = document.createElement('div');
      exportGroup.className = 'pjv-btn-group';

      const copyImgBtn = document.createElement('button');
      copyImgBtn.className = 'pjv-btn';
      copyImgBtn.title = 'Copy Chart Image to Clipboard';
      copyImgBtn.textContent = '📋 Copy';
      copyImgBtn.onclick = () => this.copyImageToClipboard(activeDataset);

      const expPngBtn = document.createElement('button');
      expPngBtn.className = 'pjv-btn active';
      expPngBtn.title = 'Download High-Res PNG Image';
      expPngBtn.textContent = '📷 PNG';
      expPngBtn.onclick = () => this.exportPng(activeDataset);

      const expSvgBtn = document.createElement('button');
      expSvgBtn.className = 'pjv-btn';
      expSvgBtn.title = 'Download Vector SVG';
      expSvgBtn.textContent = '📥 SVG';
      expSvgBtn.onclick = () => this.exportSvg(activeDataset);

      exportGroup.appendChild(copyImgBtn);
      exportGroup.appendChild(expPngBtn);
      exportGroup.appendChild(expSvgBtn);

      controlsBar.appendChild(exportGroup);
      wrapper.appendChild(controlsBar);
    }

    const chartDisplayArea = document.createElement('div');
    wrapper.appendChild(chartDisplayArea);

    this.container.appendChild(wrapper);
    this.renderChartBody(chartDisplayArea, activeDataset);
  }

  private updateTypeButtons(btnGroup: HTMLElement, activeBtn: HTMLElement) {
    const btns = btnGroup.querySelectorAll('.pjv-btn');
    btns.forEach((btn) => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  private renderChartBody(displayArea: HTMLElement, dataset: ChartTabDataset) {
    displayArea.innerHTML = '';

    if (dataset.type === 'kpis' && dataset.kpis) {
      const kpiGrid = document.createElement('div');
      kpiGrid.className = 'pjv-chart-kpi-grid';

      dataset.kpis.forEach((kpi) => {
        const card = document.createElement('div');
        card.className = 'pjv-chart-kpi-card';
        card.innerHTML = `
          <div class="pjv-kpi-label">${this.escapeHtml(kpi.label)}</div>
          <div class="pjv-kpi-val">${kpi.value}</div>
        `;
        kpiGrid.appendChild(card);
      });

      displayArea.appendChild(kpiGrid);
      return;
    }

    if (dataset.type === 'breakdown' && dataset.breakdown) {
      const card = document.createElement('div');
      card.className = 'pjv-chart-card';
      card.innerHTML = `
        <div class="pjv-chart-title">${dataset.icon} ${this.escapeHtml(dataset.label)}</div>
        <div class="pjv-donut-wrapper">
          ${this.renderSvgDonut(dataset.breakdown)}
          ${this.renderLegend(dataset.breakdown)}
        </div>
      `;
      displayArea.appendChild(card);
      return;
    }

    if (dataset.type === 'array' && dataset.array) {
      let items: { label: string; value: number }[] = [];
      const labelKey = this.selectedLabelKey || Object.keys(dataset.array[0])[0];

      if (this.aggregationMode === 'count') {
        const countsMap = new Map<string, number>();
        dataset.array.forEach((row) => {
          const catName = String(row[labelKey] || 'Unspecified');
          countsMap.set(catName, (countsMap.get(catName) || 0) + 1);
        });
        countsMap.forEach((count, cat) => items.push({ label: cat, value: count }));
        items.sort((a, b) => b.value - a.value);
      } else {
        const valKey = this.selectedValueKey || Object.keys(dataset.array[0]).find((k) => typeof dataset.array![0][k] === 'number' && !isIdField(k)) || labelKey;
        dataset.array.forEach((row) => {
          const l = String(row[labelKey] || 'Item');
          const v = Number(row[valKey]) || 0;
          items.push({ label: l, value: v });
        });
      }

      if (this.topNLimit > 0 && items.length > this.topNLimit) {
        items = items.slice(0, this.topNLimit);
      }

      const card = document.createElement('div');
      card.className = 'pjv-chart-card';

      const chartTitle = this.aggregationMode === 'count'
        ? `📋 ${this.escapeHtml(dataset.label)} — Count by ${this.escapeHtml(labelKey)}`
        : `📊 ${this.escapeHtml(dataset.label)} — ${this.escapeHtml(this.selectedValueKey)}`;

      if (this.selectedChartType === 'donut') {
        card.innerHTML = `
          <div class="pjv-chart-title">🍩 ${chartTitle}</div>
          <div class="pjv-donut-wrapper">
            ${this.renderSvgDonut(items)}
            ${this.renderLegend(items)}
          </div>
          ${this.renderSummaryStats(items)}
        `;
      } else {
        card.innerHTML = `
          <div class="pjv-chart-title">${chartTitle}</div>
          <div>${this.renderSvgBarChart(items, this.selectedChartType === 'vbar')}</div>
          ${this.renderSummaryStats(items)}
        `;
      }

      displayArea.appendChild(card);
    }
  }

  private renderSummaryStats(items: { label: string; value: number }[]): string {
    if (!items || items.length === 0) return '';

    let maxItem = items[0];
    let minItem = items[0];
    let sum = 0;

    items.forEach((item) => {
      sum += item.value;
      if (item.value > maxItem.value) maxItem = item;
      if (item.value < minItem.value) minItem = item;
    });

    const avg = formatNumericValue(sum / items.length);
    const sumStr = formatNumericValue(sum);

    return `
      <div class="pjv-chart-summary-bar">
        <div class="pjv-summary-stat-badge">
          <span class="stat-title">🟢 Maximum</span>
          <span class="stat-val">${formatNumericValue(maxItem.value)}</span>
          <span class="stat-sub" title="${this.escapeHtml(maxItem.label)}">${this.escapeHtml(maxItem.label)}</span>
        </div>
        <div class="pjv-summary-stat-badge">
          <span class="stat-title">🔴 Minimum</span>
          <span class="stat-val">${formatNumericValue(minItem.value)}</span>
          <span class="stat-sub" title="${this.escapeHtml(minItem.label)}">${this.escapeHtml(minItem.label)}</span>
        </div>
        <div class="pjv-summary-stat-badge">
          <span class="stat-title">📐 Average</span>
          <span class="stat-val">${avg}</span>
          <span class="stat-sub">${items.length} items</span>
        </div>
        <div class="pjv-summary-stat-badge">
          <span class="stat-title">🔢 Total Sum</span>
          <span class="stat-val">${sumStr}</span>
          <span class="stat-sub">100% total</span>
        </div>
      </div>
    `;
  }

  private renderSvgDonut(slices: { label: string; value: number }[]): string {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return '<div style="color:var(--pjv-text-muted); padding:20px;">No non-zero data for donut chart</div>';

    const radius = 60;
    const strokeWidth = 24;
    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;

    const svgPaths = slices.map((slice, i) => {
      const pct = slice.value / total;
      const dashArray = `${pct * circumference} ${circumference}`;
      const dashOffset = -accumulatedAngle * circumference;
      accumulatedAngle += pct;
      const color = PALETTE[i % PALETTE.length];

      return `
        <circle
          cx="80" cy="80" r="${radius}"
          fill="none"
          stroke="${color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${dashArray}"
          stroke-dashoffset="${dashOffset}"
          style="transition: stroke-width 0.2s ease, opacity 0.2s ease; cursor: pointer;"
        >
          <title>${this.escapeHtml(slice.label)}: ${formatNumericValue(slice.value)} (${(pct * 100).toFixed(1)}%)</title>
        </circle>
      `;
    }).join('');

    const formattedTotal = formatNumericValue(total);

    return `
      <svg width="160" height="160" viewBox="0 0 160 160" style="transform: rotate(-90deg); flex-shrink: 0;">
        ${svgPaths}
        <text x="80" y="85" text-anchor="middle" dominant-baseline="middle"
              style="transform: rotate(90deg); transform-origin: center; font-weight:700; font-size:16px; fill:var(--pjv-text-main);">
          ${formattedTotal}
        </text>
      </svg>
    `;
  }

  private renderLegend(slices: { label: string; value: number }[]): string {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const legendItems = slices.map((slice, i) => {
      const color = PALETTE[i % PALETTE.length];
      const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0';
      return `
        <div class="pjv-legend-item">
          <div class="pjv-legend-left">
            <div class="pjv-legend-dot" style="background:${color};"></div>
            <span>${this.escapeHtml(slice.label)}</span>
          </div>
          <div class="pjv-legend-val">${formatNumericValue(slice.value)} (${pct}%)</div>
        </div>
      `;
    }).join('');

    return `<div class="pjv-chart-legend">${legendItems}</div>`;
  }

  private renderSvgBarChart(items: { label: string; value: number }[], isVertical = false): string {
    const maxVal = Math.max(...items.map((i) => i.value), 1);

    if (isVertical) {
      const barCols = items.map((item, i) => {
        const color = PALETTE[i % PALETTE.length];
        const pct = Math.min(100, Math.max(4, (item.value / maxVal) * 100));
        const isRtl = /[\u0600-\u06FF]/.test(item.label);

        return `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; min-width: 45px;">
            <span style="font-size: 11px; font-weight: 700; font-family: var(--pjv-font-mono); color: ${color};">${formatNumericValue(item.value)}</span>
            <div style="width: 100%; height: 140px; background: var(--pjv-border-color); border-radius: 6px; display: flex; align-items: flex-end; overflow: hidden;">
              <div style="width: 100%; height: ${pct}%; background: ${color}; border-radius: 6px 6px 0 0; transition: height 0.4s ease;"></div>
            </div>
            <span ${isRtl ? 'dir="rtl"' : ''} style="font-size: 10px; color: var(--pjv-text-muted); text-align: center; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80px;" title="${this.escapeHtml(item.label)}">
              ${this.escapeHtml(item.label)}
            </span>
          </div>
        `;
      }).join('');

      return `<div style="display: flex; align-items: flex-end; gap: 12px; padding: 10px 0; overflow-x: auto;">${barCols}</div>`;
    }

    const barRows = items.map((item, i) => {
      const color = PALETTE[i % PALETTE.length];
      const pct = Math.min(100, Math.max(0, (item.value / maxVal) * 100));
      const isRtl = /[\u0600-\u06FF]/.test(item.label);

      return `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--pjv-text-main);">
            <span ${isRtl ? 'dir="rtl"' : ''} style="font-weight: 500;">${this.escapeHtml(item.label)}</span>
            <span style="font-weight: 700; font-family: var(--pjv-font-mono); color: ${color};">${formatNumericValue(item.value)}</span>
          </div>
          <div style="height: 10px; background: var(--pjv-border-color); border-radius: 5px; overflow: hidden; position: relative;">
            <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 5px; transition: width 0.4s ease;"></div>
          </div>
        </div>
      `;
    }).join('');

    return `<div>${barRows}</div>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private truncate(str: string, maxLen: number): string {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  private getActiveChartItems(dataset: ChartTabDataset): { title: string; items: { label: string; value: number }[] } {
    if (dataset.type === 'breakdown' && dataset.breakdown) {
      return {
        title: `${dataset.icon} ${dataset.label}`,
        items: dataset.breakdown
      };
    }

    if (dataset.type === 'array' && dataset.array) {
      let items: { label: string; value: number }[] = [];
      const labelKey = this.selectedLabelKey || Object.keys(dataset.array[0])[0];

      if (this.aggregationMode === 'count') {
        const countsMap = new Map<string, number>();
        dataset.array.forEach((row) => {
          const catName = String(row[labelKey] || 'Unspecified');
          countsMap.set(catName, (countsMap.get(catName) || 0) + 1);
        });
        countsMap.forEach((count, cat) => items.push({ label: cat, value: count }));
        items.sort((a, b) => b.value - a.value);
      } else {
        const valKey = this.selectedValueKey || Object.keys(dataset.array[0]).find((k) => typeof dataset.array![0][k] === 'number' && !isIdField(k)) || labelKey;
        dataset.array.forEach((row) => {
          const l = String(row[labelKey] || 'Item');
          const v = Number(row[valKey]) || 0;
          items.push({ label: l, value: v });
        });
      }

      if (this.topNLimit > 0 && items.length > this.topNLimit) {
        items = items.slice(0, this.topNLimit);
      }

      const chartTitle = this.aggregationMode === 'count'
        ? `${dataset.label} — Count by ${labelKey}`
        : `${dataset.label} — ${this.selectedValueKey}`;

      return { title: chartTitle, items };
    }

    return { title: dataset.label, items: [] };
  }

  public generateCompleteChartSvg(dataset: ChartTabDataset): { svgString: string; width: number; height: number } | null {
    const { title, items } = this.getActiveChartItems(dataset);
    if (!items || items.length === 0) return null;

    const width = 800;
    const height = 520;
    const padding = 28;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bgMain = isDark ? '#14141e' : '#f8fafc';
    const bgCard = isDark ? '#1e1e2d' : '#ffffff';
    const borderColor = isDark ? '#2e2e44' : '#e2e8f0';
    const textMain = isDark ? '#f1f5f9' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const syntaxKey = isDark ? '#38bdf8' : '#0284c7';

    // Summary calculations
    let maxVal = Math.max(...items.map((i) => i.value), 1);
    let minVal = Math.min(...items.map((i) => i.value));
    let sum = items.reduce((s, i) => s + i.value, 0);
    let avg = (sum / items.length).toFixed(2);

    let chartContentSvg = '';

    if (this.selectedChartType === 'donut' || dataset.type === 'breakdown') {
      // Donut Chart Vector Elements
      const cx = 200;
      const cy = 220;
      const radius = 95;
      const strokeWidth = 36;
      const circumference = 2 * Math.PI * radius;
      let accumulatedAngle = 0;

      const circles = items.map((slice, i) => {
        const pct = slice.value / sum;
        const dashArray = `${pct * circumference} ${circumference}`;
        const dashOffset = -accumulatedAngle * circumference;
        accumulatedAngle += pct;
        const color = PALETTE[i % PALETTE.length];

        return `
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 ${cx} ${cy})" />
        `;
      }).join('\n      ');

      // Legend Items
      const legendRows = items.slice(0, 10).map((slice, i) => {
        const color = PALETTE[i % PALETTE.length];
        const pct = sum > 0 ? ((slice.value / sum) * 100).toFixed(1) : '0';
        const rowY = 120 + i * 26;
        return `
          <g transform="translate(380, ${rowY})">
            <rect x="0" y="0" width="12" height="12" rx="3" fill="${color}" />
            <text x="20" y="10" fill="${textMain}" font-size="11" font-family="-apple-system, sans-serif" font-weight="500">${this.escapeHtml(this.truncate(slice.label, 22))}</text>
            <text x="360" y="10" fill="${textMuted}" font-size="11" font-family="monospace" text-anchor="end">${formatNumericValue(slice.value)} (${pct}%)</text>
          </g>
        `;
      }).join('\n      ');

      chartContentSvg = `
        <g id="donut-graphic">
          ${circles}
          <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="22" font-weight="700" fill="${textMain}" font-family="-apple-system, sans-serif">${formatNumericValue(sum)}</text>
          <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="11" fill="${textMuted}" font-family="-apple-system, sans-serif">Total</text>
        </g>
        <g id="donut-legend">
          ${legendRows}
        </g>
      `;
    } else if (this.selectedChartType === 'vbar') {
      // Vertical Bar Chart Vector Elements
      const plotX = 50;
      const plotY = 90;
      const plotW = 700;
      const plotH = 260;
      const barCount = Math.min(items.length, 16);
      const visibleItems = items.slice(0, barCount);
      const colWidth = plotW / barCount;
      const barWidth = Math.min(42, colWidth * 0.65);

      const barsSvg = visibleItems.map((item, i) => {
        const color = PALETTE[i % PALETTE.length];
        const barHeight = Math.max(8, (item.value / maxVal) * (plotH - 50));
        const barX = plotX + i * colWidth + (colWidth - barWidth) / 2;
        const barY = plotY + plotH - barHeight;

        return `
          <g>
            <text x="${barX + barWidth / 2}" y="${barY - 8}" fill="${color}" font-size="10.5" font-weight="700" font-family="monospace" text-anchor="middle">${formatNumericValue(item.value)}</text>
            <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5" ry="5" fill="${color}" />
            <text x="${barX + barWidth / 2}" y="${plotY + plotH + 18}" fill="${textMuted}" font-size="10" font-family="-apple-system, sans-serif" text-anchor="middle">${this.escapeHtml(this.truncate(item.label, 10))}</text>
          </g>
        `;
      }).join('\n      ');

      chartContentSvg = `
        <g id="vbar-graphic">
          <line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="${borderColor}" stroke-width="1.5" />
          ${barsSvg}
        </g>
      `;
    } else {
      // Horizontal Bar Chart Vector Elements
      const plotX = 50;
      const plotY = 90;
      const rowCount = Math.min(items.length, 8);
      const visibleItems = items.slice(0, rowCount);

      const rowsSvg = visibleItems.map((item, i) => {
        const color = PALETTE[i % PALETTE.length];
        const pct = Math.min(100, Math.max(4, (item.value / maxVal) * 100));
        const rowY = plotY + i * 36;
        const barW = (pct / 100) * 600;

        return `
          <g transform="translate(${plotX}, ${rowY})">
            <text x="0" y="10" fill="${textMain}" font-size="11" font-weight="500" font-family="-apple-system, sans-serif">${this.escapeHtml(this.truncate(item.label, 26))}</text>
            <text x="700" y="10" fill="${color}" font-size="11" font-weight="700" font-family="monospace" text-anchor="end">${formatNumericValue(item.value)}</text>
            <rect x="0" y="16" width="700" height="10" rx="5" fill="${borderColor}" />
            <rect x="0" y="16" width="${barW}" height="10" rx="5" fill="${color}" />
          </g>
        `;
      }).join('\n      ');

      chartContentSvg = `
        <g id="hbar-graphic">
          ${rowsSvg}
        </g>
      `;
    }

    // Summary Stats Box Footer
    const summarySvg = `
      <g id="summary-badge-box" transform="translate(${padding}, 415)">
        <rect width="${width - padding * 2}" height="70" rx="8" fill="${bgMain}" stroke="${borderColor}" stroke-width="1" />
        <g transform="translate(30, 24)">
          <text x="0" y="0" fill="${textMuted}" font-size="9.5" font-weight="600" text-transform="uppercase">🟢 Maximum</text>
          <text x="0" y="24" fill="${syntaxKey}" font-size="16" font-weight="700" font-family="monospace">${formatNumericValue(maxVal)}</text>
        </g>
        <g transform="translate(220, 24)">
          <text x="0" y="0" fill="${textMuted}" font-size="9.5" font-weight="600" text-transform="uppercase">🔴 Minimum</text>
          <text x="0" y="24" fill="${textMain}" font-size="16" font-weight="700" font-family="monospace">${formatNumericValue(minVal)}</text>
        </g>
        <g transform="translate(410, 24)">
          <text x="0" y="0" fill="${textMuted}" font-size="9.5" font-weight="600" text-transform="uppercase">📐 Average</text>
          <text x="0" y="24" fill="${textMain}" font-size="16" font-weight="700" font-family="monospace">${avg}</text>
        </g>
        <g transform="translate(590, 24)">
          <text x="0" y="0" fill="${textMuted}" font-size="9.5" font-weight="600" text-transform="uppercase">🔢 Total Sum</text>
          <text x="0" y="24" fill="${syntaxKey}" font-size="16" font-weight="700" font-family="monospace">${formatNumericValue(sum)}</text>
        </g>
      </g>
    `;

    const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Background Card -->
  <rect width="100%" height="100%" rx="12" fill="${bgCard}" stroke="${borderColor}" stroke-width="1.5" />
  
  <!-- Header Title -->
  <text x="${padding}" y="45" fill="${syntaxKey}" font-size="16" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">${this.escapeHtml(title)}</text>
  <line x1="${padding}" y1="62" x2="${width - padding}" y2="62" stroke="${borderColor}" stroke-width="1" />
  
  <!-- Chart Graphic -->
  ${chartContentSvg}
  
  <!-- Summary Box -->
  ${summarySvg}
</svg>`;

    return { svgString, width, height };
  }

  public exportSvg(dataset: ChartTabDataset) {
    const res = this.generateCompleteChartSvg(dataset);
    if (!res) return;

    const blob = new Blob([res.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `json-chart-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (this.onToast) this.onToast('Exported vector SVG chart!');
  }

  public exportPng(dataset: ChartTabDataset) {
    const res = this.generateCompleteChartSvg(dataset);
    if (!res) return;

    if (this.onToast) this.onToast('Rendering high-res PNG chart...');

    const svgBlob = new Blob([res.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const scaleFactor = 2; // 2x Retina quality
      const canvas = document.createElement('canvas');
      canvas.width = res.width * scaleFactor;
      canvas.height = res.height * scaleFactor;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        return;
      }

      ctx.scale(scaleFactor, scaleFactor);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(blobUrl);
        if (!pngBlob) return;

        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `json-chart-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        if (this.onToast) this.onToast('Exported high-res PNG chart image!');
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      if (this.onToast) this.onToast('Exporting SVG fallback...');
      this.exportSvg(dataset);
    };

    img.src = blobUrl;
  }

  public copyImageToClipboard(dataset: ChartTabDataset) {
    const res = this.generateCompleteChartSvg(dataset);
    if (!res) return;

    if (this.onToast) this.onToast('Rendering chart for clipboard...');

    const svgBlob = new Blob([res.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const scaleFactor = 2;
      const canvas = document.createElement('canvas');
      canvas.width = res.width * scaleFactor;
      canvas.height = res.height * scaleFactor;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        return;
      }

      ctx.scale(scaleFactor, scaleFactor);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(async (pngBlob) => {
        URL.revokeObjectURL(blobUrl);
        if (!pngBlob) return;

        try {
          if (navigator.clipboard && (window as any).ClipboardItem) {
            const item = new ClipboardItem({ 'image/png': pngBlob });
            await navigator.clipboard.write([item]);
            if (this.onToast) this.onToast('Copied chart image to clipboard! 📋');
          } else {
            if (this.onToast) this.onToast('Clipboard API not supported, downloading PNG...');
            this.exportPng(dataset);
          }
        } catch (err) {
          if (this.onToast) this.onToast('Failed to copy to clipboard, downloading PNG...');
          this.exportPng(dataset);
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      if (this.onToast) this.onToast('Failed to render chart image');
    };

    img.src = blobUrl;
  }
}
