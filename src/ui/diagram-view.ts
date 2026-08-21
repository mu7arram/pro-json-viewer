export interface DiagramViewOptions {
  container: HTMLElement;
  data: any;
  defaultDepth?: number;
  maxDepth?: number;
  onToast?: (msg: string) => void;
}

interface PrimitiveProperty {
  key: string;
  val: string;
}

interface DiagramNode {
  id: string;
  key: string;
  type: 'object' | 'array' | 'primitive';
  valueSummary: string;
  primitiveProps: PrimitiveProperty[];
  children: DiagramNode[];
  isExpanded: boolean;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  subtreeHeight: number;
}

export class DiagramView {
  private container: HTMLElement;
  private rawData: any;
  private onToast?: (msg: string) => void;

  private rootNode: DiagramNode | null = null;
  private orientation: 'horizontal' | 'vertical' = 'horizontal';
  private expandedMap = new Map<string, boolean>();
  private currentDepth = 2;
  private maxDepth = 3;
  private searchQuery = '';

  // Pan & Zoom state
  private zoom = 1;
  private panX = 60;
  private panY = 60;
  private isDragging = false;
  private startDragX = 0;
  private startDragY = 0;

  // DOM Elements
  private wrapperEl: HTMLElement | null = null;
  private viewportEl: HTMLElement | null = null;
  private canvasLayerEl: HTMLElement | null = null;
  private svgLayerEl: SVGElement | null = null;
  private nodesLayerEl: HTMLElement | null = null;
  private searchInputEl: HTMLInputElement | null = null;

  constructor(options: DiagramViewOptions) {
    this.container = options.container;
    this.rawData = options.data;
    this.currentDepth = options.defaultDepth || 2;
    this.maxDepth = options.maxDepth || 3;
    this.onToast = options.onToast;

    this.initGraph();
    this.renderShell();
    this.renderCanvas();
  }

  private initGraph() {
    this.rootNode = this.buildNode(this.rawData, 'root', 1, 'root');
  }

  private buildNode(value: any, key: string, depth: number, id: string): DiagramNode {
    const isArray = Array.isArray(value);
    const isObj = typeof value === 'object' && value !== null && !isArray;
    const isExpanded = this.expandedMap.has(id)
      ? this.expandedMap.get(id)!
      : depth <= this.currentDepth;

    const primitiveProps: PrimitiveProperty[] = [];
    const children: DiagramNode[] = [];
    let valueSummary = '';

    if (isArray) {
      valueSummary = `[ ${value.length} items ]`;
      value.forEach((item: any, idx: number) => {
        const childId = `${id}[${idx}]`;
        if (typeof item === 'object' && item !== null) {
          children.push(this.buildNode(item, `[${idx}]`, depth + 1, childId));
        } else {
          primitiveProps.push({ key: `[${idx}]`, val: String(item) });
        }
      });
    } else if (isObj) {
      const keys = Object.keys(value);
      valueSummary = `{ ${keys.length} keys }`;
      keys.forEach((k) => {
        const val = value[k];
        const childId = `${id}.${k}`;
        if (typeof val === 'object' && val !== null) {
          children.push(this.buildNode(val, k, depth + 1, childId));
        } else {
          primitiveProps.push({ key: k, val: String(val) });
        }
      });
    } else {
      valueSummary = String(value);
    }

    const type = isArray ? 'array' : (isObj ? 'object' : 'primitive');
    const propRows = Math.min(primitiveProps.length, 6);
    const baseHeight = 46;
    const height = baseHeight + propRows * 18 + (primitiveProps.length > 6 ? 18 : 0);
    const width = 220;

    return {
      id,
      key,
      type,
      valueSummary,
      primitiveProps,
      children,
      isExpanded,
      depth,
      x: 0,
      y: 0,
      width,
      height,
      subtreeHeight: height
    };
  }

  private computeLayout() {
    if (!this.rootNode) return;

    if (this.orientation === 'horizontal') {
      this.layoutHorizontal(this.rootNode);
      this.assignPositionsHorizontal(this.rootNode, 0, 0);
    } else {
      this.layoutVertical(this.rootNode);
      this.assignPositionsVertical(this.rootNode, 0, 0);
    }
  }

  private layoutHorizontal(node: DiagramNode): number {
    if (!node.isExpanded || node.children.length === 0) {
      node.subtreeHeight = node.height + 24;
      return node.subtreeHeight;
    }

    let total = 0;
    node.children.forEach((child) => {
      total += this.layoutHorizontal(child);
    });

    node.subtreeHeight = Math.max(node.height + 24, total);
    return node.subtreeHeight;
  }

  private assignPositionsHorizontal(node: DiagramNode, currentX: number, startY: number) {
    node.x = currentX;
    node.y = startY + node.subtreeHeight / 2 - node.height / 2;

    if (node.isExpanded && node.children.length > 0) {
      let childY = startY;
      const nextX = currentX + node.width + 80;
      node.children.forEach((child) => {
        this.assignPositionsHorizontal(child, nextX, childY);
        childY += child.subtreeHeight;
      });
    }
  }

  private layoutVertical(node: DiagramNode): number {
    if (!node.isExpanded || node.children.length === 0) {
      node.subtreeHeight = node.width + 30;
      return node.subtreeHeight;
    }

    let total = 0;
    node.children.forEach((child) => {
      total += this.layoutVertical(child);
    });

    node.subtreeHeight = Math.max(node.width + 30, total);
    return node.subtreeHeight;
  }

  private assignPositionsVertical(node: DiagramNode, startX: number, currentY: number) {
    node.x = startX + node.subtreeHeight / 2 - node.width / 2;
    node.y = currentY;

    if (node.isExpanded && node.children.length > 0) {
      let childX = startX;
      const nextY = currentY + node.height + 60;
      node.children.forEach((child) => {
        this.assignPositionsVertical(child, childX, nextY);
        childX += child.subtreeHeight;
      });
    }
  }

  private renderShell() {
    this.container.innerHTML = '';

    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'pjv-diagram-container';

    const maxButtons = Math.min(Math.max(2, this.maxDepth), 6);
    let depthButtonsHtml = '';
    for (let d = 1; d <= maxButtons; d++) {
      depthButtonsHtml += `<button id="pjv-diag-d${d}" class="pjv-btn" title="Expand Diagram to Depth ${d}">D${d}</button>`;
    }

    // 1. Floating Diagram Control Toolbar
    const controls = document.createElement('div');
    controls.className = 'pjv-diagram-controls';
    controls.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-weight:700; font-size:12px; color:var(--pjv-syntax-key);">🗺️ Diagram</span>
        <div class="pjv-btn-group">
          <button id="pjv-diag-zoom-in" class="pjv-btn" title="Zoom In" style="font-weight:800; font-size:14px; line-height:1; min-width:28px;">+</button>
          <button id="pjv-diag-zoom-out" class="pjv-btn" title="Zoom Out" style="font-weight:800; font-size:14px; line-height:1; min-width:28px;">&minus;</button>
          <button id="pjv-diag-zoom-reset" class="pjv-btn" title="Reset Zoom">100%</button>
          <button id="pjv-diag-fit" class="pjv-btn" title="Fit to Screen">⊡ Fit</button>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <div class="pjv-btn-group">
          <button id="pjv-diag-orient-h" class="pjv-btn ${this.orientation === 'horizontal' ? 'active' : ''}">Mindmap ⬌</button>
          <button id="pjv-diag-orient-v" class="pjv-btn ${this.orientation === 'vertical' ? 'active' : ''}">Tree ⬍</button>
        </div>

        <div class="pjv-btn-group">
          ${depthButtonsHtml}
          <button id="pjv-diag-expand" class="pjv-btn">Expand</button>
          <button id="pjv-diag-collapse" class="pjv-btn">Collapse</button>
        </div>

        <input type="text" id="pjv-diag-search" placeholder="Search node..." style="
          background: var(--pjv-bg-main); color: var(--pjv-text-main);
          border: 1px solid var(--pjv-border-color); border-radius: 4px;
          padding: 4px 8px; font-size: 11px; outline: none; width: 120px;
        " />

        <div class="pjv-btn-group">
          <button id="pjv-diag-exp-png" class="pjv-btn" title="Export Diagram as PNG">📷 PNG</button>
          <button id="pjv-diag-exp-svg" class="pjv-btn" title="Export Diagram as SVG">📥 SVG</button>
        </div>
      </div>
    `;

    this.wrapperEl.appendChild(controls);

    // 2. Viewport & Canvas
    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'pjv-diagram-viewport';

    this.canvasLayerEl = document.createElement('div');
    this.canvasLayerEl.className = 'pjv-diagram-canvas';

    this.svgLayerEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgLayerEl.setAttribute('class', 'pjv-diagram-svg');
    this.svgLayerEl.style.position = 'absolute';
    this.svgLayerEl.style.top = '0';
    this.svgLayerEl.style.left = '0';
    this.svgLayerEl.style.width = '10000px';
    this.svgLayerEl.style.height = '10000px';
    this.svgLayerEl.style.pointerEvents = 'none';

    this.canvasLayerEl.appendChild(this.svgLayerEl);

    this.nodesLayerEl = document.createElement('div');
    this.nodesLayerEl.className = 'pjv-diagram-nodes-layer';
    this.canvasLayerEl.appendChild(this.nodesLayerEl);

    this.viewportEl.appendChild(this.canvasLayerEl);
    this.wrapperEl.appendChild(this.viewportEl);
    this.container.appendChild(this.wrapperEl);

    this.bindCanvasInteractions(this.viewportEl, this.canvasLayerEl);
    this.bindControls(controls, this.canvasLayerEl);
  }

  private renderCanvas() {
    if (!this.svgLayerEl || !this.nodesLayerEl || !this.canvasLayerEl) return;

    this.computeLayout();
    this.svgLayerEl.innerHTML = '';
    this.nodesLayerEl.innerHTML = '';

    const allNodes: DiagramNode[] = [];
    const collect = (n: DiagramNode) => {
      allNodes.push(n);
      if (n.isExpanded) {
        n.children.forEach(collect);
      }
    };
    if (this.rootNode) collect(this.rootNode);

    // 1. Draw SVG Connectors
    const isH = this.orientation === 'horizontal';
    allNodes.forEach((node) => {
      if (node.isExpanded && node.children.length > 0) {
        node.children.forEach((child) => {
          const fromX = isH ? node.x + node.width : node.x + node.width / 2;
          const fromY = isH ? node.y + node.height / 2 : node.y + node.height;
          const toX = isH ? child.x : child.x + child.width / 2;
          const toY = isH ? child.y + child.height / 2 : child.y;

          const dx = Math.abs(toX - fromX) * 0.5;
          const dy = Math.abs(toY - fromY) * 0.5;

          const d = isH
            ? `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`
            : `M ${fromX} ${fromY} C ${fromX} ${fromY + dy}, ${toX} ${toY - dy}, ${toX} ${toY}`;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('class', 'pjv-diagram-edge');
          this.svgLayerEl!.appendChild(path);
        });
      }
    });

    // 2. Render Node Cards
    allNodes.forEach((node) => {
      const isMatched = this.isNodeMatched(node);

      const card = document.createElement('div');
      card.className = `pjv-diagram-node ${node.type} ${isMatched ? 'pjv-highlight' : ''}`;
      card.dataset.nodeId = node.id;
      card.style.left = `${node.x}px`;
      card.style.top = `${node.y}px`;
      card.style.width = `${node.width}px`;

      const typeBadge = node.type === 'array' ? '🗂️ Array' : (node.type === 'object' ? '📦 Object' : '📄 Value');
      const hasChildren = node.children.length > 0;

      let propsHtml = '';
      const visibleProps = node.primitiveProps.slice(0, 6);
      if (visibleProps.length > 0) {
        propsHtml = `
          <div class="pjv-node-props">
            ${visibleProps.map((p) => `
              <div class="pjv-node-prop-row">
                <span class="prop-key">${escapeHtml(p.key)}:</span>
                <span class="prop-val">${escapeHtml(p.val)}</span>
              </div>
            `).join('')}
            ${node.primitiveProps.length > 6 ? `<div class="pjv-node-more">+${node.primitiveProps.length - 6} more</div>` : ''}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="pjv-node-header">
          <div class="pjv-node-title">
            <span class="pjv-node-badge ${node.type}">${typeBadge}</span>
            <span class="pjv-node-key" title="${escapeHtml(node.key)}">${escapeHtml(node.key)}</span>
          </div>
          <span class="pjv-node-count">${node.valueSummary}</span>
        </div>
        ${propsHtml}
        ${hasChildren ? `
          <div class="pjv-node-toggle" title="${node.isExpanded ? 'Collapse branch' : 'Expand branch'}">
            ${node.isExpanded ? '▼' : '▶'}
          </div>
        ` : ''}
      `;

      if (hasChildren) {
        const toggleBtn = card.querySelector('.pjv-node-toggle');
        if (toggleBtn) {
          toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.expandedMap.set(node.id, !node.isExpanded);
            this.initGraph();
            this.renderCanvas();
          });
        }
      }

      this.nodesLayerEl!.appendChild(card);
    });

    this.updateCanvasTransform(this.canvasLayerEl);
  }

  private isNodeMatched(node: DiagramNode): boolean {
    if (!this.searchQuery) return false;
    return (
      node.key.toLowerCase().includes(this.searchQuery) ||
      node.primitiveProps.some((p) => p.key.toLowerCase().includes(this.searchQuery) || p.val.toLowerCase().includes(this.searchQuery))
    );
  }

  private updateSearchHighlights() {
    if (!this.nodesLayerEl) return;
    const allNodes: DiagramNode[] = [];
    const collect = (n: DiagramNode) => {
      allNodes.push(n);
      if (n.isExpanded) n.children.forEach(collect);
    };
    if (this.rootNode) collect(this.rootNode);

    const nodeMap = new Map<string, DiagramNode>();
    allNodes.forEach((n) => nodeMap.set(n.id, n));

    const cardEls = this.nodesLayerEl.querySelectorAll('.pjv-diagram-node');
    cardEls.forEach((card) => {
      const id = (card as HTMLElement).dataset.nodeId;
      const node = id ? nodeMap.get(id) : null;
      if (node && this.isNodeMatched(node)) {
        card.classList.add('pjv-highlight');
      } else {
        card.classList.remove('pjv-highlight');
      }
    });
  }

  private updateCanvasTransform(canvas: HTMLElement) {
    canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    canvas.style.transformOrigin = '0 0';
  }

  private bindCanvasInteractions(viewport: HTMLElement, canvas: HTMLElement) {
    viewport.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.pjv-diagram-node')) return;
      this.isDragging = true;
      this.startDragX = e.clientX - this.panX;
      this.startDragY = e.clientY - this.panY;
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.startDragX;
      this.panY = e.clientY - this.startDragY;
      this.updateCanvasTransform(canvas);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        viewport.style.cursor = 'grab';
      }
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(2.5, Math.max(0.2, this.zoom * zoomFactor));

      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.updateCanvasTransform(canvas);
    }, { passive: false });
  }

  private bindControls(controls: HTMLElement, canvas: HTMLElement) {
    controls.querySelector('#pjv-diag-zoom-in')!.addEventListener('click', () => {
      this.zoom = Math.min(2.5, this.zoom * 1.2);
      this.updateCanvasTransform(canvas);
    });

    controls.querySelector('#pjv-diag-zoom-out')!.addEventListener('click', () => {
      this.zoom = Math.max(0.2, this.zoom / 1.2);
      this.updateCanvasTransform(canvas);
    });

    controls.querySelector('#pjv-diag-zoom-reset')!.addEventListener('click', () => {
      this.zoom = 1;
      this.panX = 60;
      this.panY = 60;
      this.updateCanvasTransform(canvas);
    });

    controls.querySelector('#pjv-diag-fit')!.addEventListener('click', () => {
      this.fitToScreen(canvas);
    });

    const hBtn = controls.querySelector('#pjv-diag-orient-h') as HTMLButtonElement;
    const vBtn = controls.querySelector('#pjv-diag-orient-v') as HTMLButtonElement;

    hBtn.addEventListener('click', () => {
      this.orientation = 'horizontal';
      hBtn.classList.add('active');
      vBtn.classList.remove('active');
      this.renderCanvas();
    });

    vBtn.addEventListener('click', () => {
      this.orientation = 'vertical';
      vBtn.classList.add('active');
      hBtn.classList.remove('active');
      this.renderCanvas();
    });

    const maxButtons = Math.min(Math.max(2, this.maxDepth), 6);
    for (let d = 1; d <= maxButtons; d++) {
      controls.querySelector(`#pjv-diag-d${d}`)?.addEventListener('click', () => this.setExpandDepth(d));
    }
    controls.querySelector('#pjv-diag-expand')!.addEventListener('click', () => this.setExpandDepth(100));
    controls.querySelector('#pjv-diag-collapse')!.addEventListener('click', () => this.setExpandDepth(0));

    this.searchInputEl = controls.querySelector('#pjv-diag-search') as HTMLInputElement;
    this.searchInputEl.value = this.searchQuery;
    this.searchInputEl.addEventListener('input', () => {
      this.searchQuery = this.searchInputEl!.value.trim().toLowerCase();
      this.updateSearchHighlights();
    });

    controls.querySelector('#pjv-diag-exp-svg')!.addEventListener('click', () => this.exportSvg());
    controls.querySelector('#pjv-diag-exp-png')!.addEventListener('click', () => this.exportPng());
  }

  private setExpandDepth(depth: number) {
    this.expandedMap.clear();
    this.currentDepth = depth;
    this.initGraph();
    this.renderCanvas();
  }

  private fitToScreen(canvas: HTMLElement) {
    if (!this.rootNode) return;
    this.zoom = 0.85;
    this.panX = 40;
    this.panY = 40;
    this.updateCanvasTransform(canvas);
  }

  private generateCompleteSvgString(): { svgString: string; width: number; height: number } | null {
    if (!this.rootNode) return null;

    const allNodes: DiagramNode[] = [];
    const collect = (n: DiagramNode) => {
      allNodes.push(n);
      if (n.isExpanded) n.children.forEach(collect);
    };
    collect(this.rootNode);

    if (allNodes.length === 0) return null;

    // 1. Calculate tight bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    allNodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    });

    const padding = 60;
    const width = Math.ceil(maxX - minX + padding * 2);
    const height = Math.ceil(maxY - minY + padding * 2);
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;

    // 2. Safe Theme Colors (solid, high contrast hex values)
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bgMain = isDark ? '#14141e' : '#f8fafc';
    const bgBadge = isDark ? '#1e1e2d' : '#ffffff';
    const borderColor = isDark ? '#2e2e44' : '#e2e8f0';
    const textMain = isDark ? '#f1f5f9' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const syntaxKey = isDark ? '#38bdf8' : '#0284c7';
    const syntaxString = isDark ? '#4ade80' : '#16a34a';

    // 3. Generate SVG Edges (pure vector paths)
    const isH = this.orientation === 'horizontal';
    const edgesHtml: string[] = [];

    allNodes.forEach((node) => {
      if (node.isExpanded && node.children.length > 0) {
        node.children.forEach((child) => {
          const fromX = (isH ? node.x + node.width : node.x + node.width / 2) + offsetX;
          const fromY = (isH ? node.y + node.height / 2 : node.y + node.height) + offsetY;
          const toX = (isH ? child.x : child.x + child.width / 2) + offsetX;
          const toY = (isH ? child.y + child.height / 2 : child.y) + offsetY;

          const dx = Math.abs(toX - fromX) * 0.5;
          const dy = Math.abs(toY - fromY) * 0.5;

          const d = isH
            ? `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`
            : `M ${fromX} ${fromY} C ${fromX} ${fromY + dy}, ${toX} ${toY - dy}, ${toX} ${toY}`;

          edgesHtml.push(`<path d="${d}" stroke="${syntaxKey}" stroke-opacity="0.65" stroke-width="2" fill="none" stroke-linecap="round" />`);
        });
      }
    });

    // 4. Generate Pure SVG Nodes (Card rects, text, badge rects, lines)
    const nodesHtml: string[] = [];
    allNodes.forEach((node) => {
      const nx = node.x + offsetX;
      const ny = node.y + offsetY;
      const typeBadge = node.type === 'array' ? 'ARRAY' : (node.type === 'object' ? 'OBJECT' : 'VALUE');
      const badgeColor = node.type === 'array' ? '#f59e0b' : (node.type === 'object' ? syntaxKey : syntaxString);
      const badgeWidth = 48;

      const visibleProps = node.primitiveProps.slice(0, 6);
      const hasProps = visibleProps.length > 0;

      const propsLines: string[] = [];
      if (hasProps) {
        propsLines.push(`<line x1="${nx + 8}" y1="${ny + 34}" x2="${nx + node.width - 8}" y2="${ny + 34}" stroke="${borderColor}" stroke-width="1" />`);
        visibleProps.forEach((p, idx) => {
          const rowY = ny + 48 + idx * 16;
          propsLines.push(`
            <text x="${nx + 10}" y="${rowY}" fill="${textMuted}" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">${escapeHtml(truncate(p.key, 12))}:</text>
            <text x="${nx + node.width - 10}" y="${rowY}" fill="${syntaxString}" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" text-anchor="end">${escapeHtml(truncate(p.val, 14))}</text>
          `);
        });
        if (node.primitiveProps.length > 6) {
          const moreY = ny + 48 + visibleProps.length * 16;
          propsLines.push(`<text x="${nx + node.width / 2}" y="${moreY}" fill="${textMuted}" font-size="9" font-style="italic" text-anchor="middle">+${node.primitiveProps.length - 6} more</text>`);
        }
      }

      nodesHtml.push(`
        <g id="node-${escapeHtml(node.id)}">
          <!-- Card Background -->
          <rect x="${nx}" y="${ny}" width="${node.width}" height="${node.height}" rx="8" ry="8" fill="${bgBadge}" stroke="${borderColor}" stroke-width="1.5" />
          
          <!-- Type Badge -->
          <rect x="${nx + 8}" y="${ny + 9}" width="${badgeWidth}" height="16" rx="4" ry="4" fill="${bgMain}" stroke="${borderColor}" stroke-width="1" />
          <text x="${nx + 8 + badgeWidth / 2}" y="${ny + 21}" fill="${badgeColor}" font-size="8.5" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" text-anchor="middle">${typeBadge}</text>
          
          <!-- Key Title -->
          <text x="${nx + 14 + badgeWidth}" y="${ny + 21}" fill="${textMain}" font-size="11.5" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">${escapeHtml(truncate(node.key, 11))}</text>
          
          <!-- Value Summary -->
          <text x="${nx + node.width - 10}" y="${ny + 21}" fill="${textMuted}" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" text-anchor="end">${escapeHtml(node.valueSummary)}</text>
          
          ${propsLines.join('\n          ')}
        </g>
      `);
    });

    const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Background Canvas -->
  <rect width="100%" height="100%" fill="${bgMain}" />
  
  <!-- Edges -->
  <g class="edges">
    ${edgesHtml.join('\n    ')}
  </g>
  
  <!-- Nodes -->
  <g class="nodes">
    ${nodesHtml.join('\n    ')}
  </g>
</svg>`;

    return { svgString, width, height };
  }

  public exportSvg() {
    const res = this.generateCompleteSvgString();
    if (!res) return;

    const blob = new Blob([res.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `json-diagram-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (this.onToast) this.onToast('Exported styled vector SVG diagram!');
  }

  public exportPng() {
    const res = this.generateCompleteSvgString();
    if (!res) return;

    if (this.onToast) this.onToast('Rendering high-res PNG image...');

    const svgBlob = new Blob([res.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const scaleFactor = 2; // 2x Retina resolution
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
        a.download = `json-diagram-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        if (this.onToast) this.onToast('Exported high-res PNG diagram image!');
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      if (this.onToast) this.onToast('Exporting SVG fallback...');
      this.exportSvg();
    };

    img.src = blobUrl;
  }
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
