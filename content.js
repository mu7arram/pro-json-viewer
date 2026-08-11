/**
 * Pro JSON Viewer — Content Script & Core UI Engine
 * (Zero-build fully self-contained ES5/ES6 Vanilla JS script)
 */

// --- 1. SMART VALUE DETECTOR ---
function detectSmartValue(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value))) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!isNaN(num)) {
      const ms = num < 10000000000 ? num * 1000 : num;
      if (ms > 946684800000 && ms < 4102444800000) {
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
          return {
            type: 'date',
            raw: String(value),
            formatted: `📅 ${d.toISOString()} (${d.toLocaleString()})`,
            badge: 'TIMESTAMP'
          };
        }
      }
    }
  }

  if (typeof value !== 'string') return null;
  const str = value.trim();
  if (!str) return null;

  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(str)) {
    return {
      type: 'url',
      raw: str,
      formatted: str,
      badge: 'LINK'
    };
  }

  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/i.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return {
        type: 'date',
        raw: str,
        formatted: `📅 ${d.toUTCString()} (Local: ${d.toLocaleString()})`,
        badge: 'DATE'
      };
    }
  }

  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(str)) {
    try {
      const parts = str.split('.');
      const decodeBase64Url = (part) => {
        const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
        return JSON.parse(atob(padded));
      };
      const header = decodeBase64Url(parts[0]);
      const payload = decodeBase64Url(parts[1]);
      return {
        type: 'jwt',
        raw: str,
        formatted: JSON.stringify({ header, payload }, null, 2),
        badge: 'JWT',
        metadata: { header, payload }
      };
    } catch (e) {}
  }

  if (str.length >= 16 && str.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(str)) {
    try {
      const decoded = atob(str);
      if (/^[\x20-\x7E\s]+$/.test(decoded)) {
        let parsed = null;
        try { parsed = JSON.parse(decoded); } catch (e) {}
        return {
          type: 'base64',
          raw: str,
          formatted: parsed ? JSON.stringify(parsed, null, 2) : decoded,
          badge: 'BASE64',
          metadata: { decoded, parsed }
        };
      }
    } catch (e) {}
  }

  return null;
}

function detectSchemaAnomalies(array) {
  const anomalousIndexes = new Set();
  if (!Array.isArray(array) || array.length < 2) return anomalousIndexes;

  const keyFrequency = {};
  let objectCount = 0;

  for (const item of array) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      objectCount++;
      const keys = Object.keys(item);
      for (const k of keys) {
        keyFrequency[k] = (keyFrequency[k] || 0) + 1;
      }
    }
  }

  if (objectCount < 2) return anomalousIndexes;

  const threshold = Math.ceil(objectCount * 0.6);
  const expectedKeys = Object.keys(keyFrequency).filter((k) => keyFrequency[k] >= threshold);

  array.forEach((item, index) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = new Set(Object.keys(item));
      const isMissingCoreKey = expectedKeys.some((k) => !keys.has(k));
      if (isMissingCoreKey) {
        anomalousIndexes.add(index);
      }
    }
  });

  return anomalousIndexes;
}

// --- 2. PARSER & TREE BUILDER ---
function getNodeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'object') return 'object';
  if (type === 'string') return 'string';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
}

function parseJson(raw) {
  try { return JSON.parse(raw); }
  catch (err) {
    try {
      const repaired = raw
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');
      return JSON.parse(repaired);
    } catch (e) {
      throw new Error(`Invalid JSON: ${err.message}`);
    }
  }
}

function buildFlatNodes(data, defaultExpandDepth = 2, expandedStateMap = new Map()) {
  const result = [];

  function traverse(value, key, parentId, depth, pathSegments) {
    const type = getNodeType(value);
    const hasChildren = type === 'object' || type === 'array';
    
    let currentId = 'root';
    let path = '$';

    if (pathSegments.length > 0) {
      const segParts = pathSegments.map((seg) =>
        seg.type === 'index' ? `[${seg.key}]` : `.${seg.key}`
      );
      path = `$${segParts.join('')}`;
      currentId = pathSegments.map((s) => s.key).join('.');
    }

    let childCount = 0;
    if (type === 'array') childCount = value.length;
    else if (type === 'object' && value !== null) childCount = Object.keys(value).length;

    let isExpanded = depth <= defaultExpandDepth;
    if (expandedStateMap.has(currentId)) {
      isExpanded = expandedStateMap.get(currentId);
    }

    const smart = !hasChildren ? detectSmartValue(value) : null;

    const node = {
      id: currentId,
      depth,
      key,
      value: hasChildren ? (type === 'array' ? `[ ${childCount} items ]` : `{ ${childCount} items }`) : value,
      type,
      path,
      pathSegments,
      isExpanded: hasChildren ? isExpanded : false,
      hasChildren,
      childCount,
      parentId,
      smart
    };

    result.push(node);

    if (hasChildren && isExpanded) {
      if (type === 'array') {
        const anomalies = detectSchemaAnomalies(value);
        value.forEach((item, idx) => {
          const seg = { key: idx, type: 'index' };
          const isAnomaly = anomalies.has(idx);
          traverse(item, idx, currentId, depth + 1, [...pathSegments, seg]);
          if (isAnomaly) {
            const childNodeId = [...pathSegments, seg].map((s) => s.key).join('.');
            const childNode = result.find((n) => n.id === childNodeId);
            if (childNode) {
              childNode.smart = {
                type: 'schema_anomaly',
                raw: 'Schema Anomaly',
                badge: 'ANOMALY',
                formatted: '⚠️ Inconsistent key schema compared to other items in this array'
              };
            }
          }
        });
      } else if (type === 'object' && value !== null) {
        Object.keys(value).forEach((k) => {
          const seg = { key: k, type: 'property' };
          traverse(value[k], k, currentId, depth + 1, [...pathSegments, seg]);
        });
      }
    }
  }

  traverse(data, null, null, 1, []);
  return result;
}

// --- 3. SEARCH & QUERY ENGINE ---
function searchTree(nodes, query, mode = 'text') {
  const matchedIds = new Set();
  const expandAncestorIds = new Set();
  if (!query.trim()) return { matchedIds, expandAncestorIds };

  const trimmed = query.trim();
  if (mode === 'jsonpath') {
    const pathLower = trimmed.toLowerCase();
    nodes.forEach((node) => {
      if (node.path.toLowerCase().includes(pathLower)) {
        matchedIds.add(node.id);
        markAncestors(node, nodes, expandAncestorIds);
      }
    });
    return { matchedIds, expandAncestorIds };
  }

  let regex = null;
  if (mode === 'regex') {
    try { regex = new RegExp(trimmed, 'i'); }
    catch (e) { return { matchedIds, expandAncestorIds }; }
  }

  const queryLower = trimmed.toLowerCase();

  nodes.forEach((node) => {
    let matchKey = false;
    let matchVal = false;

    if (node.key !== null) {
      const keyStr = String(node.key);
      if (regex) matchKey = regex.test(keyStr);
      else matchKey = keyStr.toLowerCase().includes(queryLower);
    }

    if (!node.hasChildren && node.value !== null && node.value !== undefined) {
      const valStr = typeof node.value === 'object' ? JSON.stringify(node.value) : String(node.value);
      if (regex) matchVal = regex.test(valStr);
      else matchVal = valStr.toLowerCase().includes(queryLower);
    }

    if (matchKey || matchVal) {
      matchedIds.add(node.id);
      markAncestors(node, nodes, expandAncestorIds);
    }
  });

  return { matchedIds, expandAncestorIds };
}

function markAncestors(node, allNodes, ancestorIds) {
  let currentParentId = node.parentId;
  while (currentParentId) {
    ancestorIds.add(currentParentId);
    const parentNode = allNodes.find((n) => n.id === currentParentId);
    if (parentNode) currentParentId = parentNode.parentId;
    else break;
  }
}

// --- 4. DIFF COMPARE ENGINE ---
function computeStructuralDiff(primaryData, secondaryData) {
  const stats = { added: 0, removed: 0, modified: 0 };
  const primaryFlat = buildFlatNodes(primaryData, 100);
  const secondaryFlat = buildFlatNodes(secondaryData, 100);

  const primaryMap = new Map();
  primaryFlat.forEach((n) => primaryMap.set(n.path, n));

  const secondaryMap = new Map();
  secondaryFlat.forEach((n) => secondaryMap.set(n.path, n));

  const diffNodes = [];

  primaryFlat.forEach((pNode) => {
    const sNode = secondaryMap.get(pNode.path);
    if (!sNode) {
      stats.removed++;
      diffNodes.push({ ...pNode, diffStatus: 'removed' });
    } else {
      const pVal = pNode.hasChildren ? pNode.childCount : JSON.stringify(pNode.value);
      const sVal = sNode.hasChildren ? sNode.childCount : JSON.stringify(sNode.value);
      if (pVal !== sVal) {
        stats.modified++;
        diffNodes.push({ ...pNode, diffStatus: 'modified', oldValue: sNode.value });
      } else {
        diffNodes.push({ ...pNode, diffStatus: 'unchanged' });
      }
    }
  });

  secondaryFlat.forEach((sNode) => {
    if (!primaryMap.has(sNode.path)) {
      stats.added++;
      diffNodes.push({ ...sNode, diffStatus: 'added' });
    }
  });

  return { diffNodes, stats };
}

// --- 5. DOM VIRTUALIZER ENGINE ---
class Virtualizer {
  constructor(options) {
    this.container = options.container;
    this.rowHeight = options.rowHeight;
    this.buffer = options.buffer ?? 5;
    this.onRender = options.onRender;
    this.nodes = [];
    this.animationFrameId = null;

    this.container.style.position = 'relative';
    this.container.style.overflowY = 'auto';

    this.totalHeightSpacer = document.createElement('div');
    this.totalHeightSpacer.className = 'virtual-spacer';
    this.totalHeightSpacer.style.cssText = 'width: 100%; position: absolute; top: 0; left: 0; pointer-events: none;';

    this.contentWrapper = document.createElement('div');
    this.contentWrapper.className = 'virtual-content-wrapper';
    this.contentWrapper.style.cssText = 'width: 100%; position: absolute; top: 0; left: 0;';

    this.container.appendChild(this.totalHeightSpacer);
    this.container.appendChild(this.contentWrapper);

    this.scrollListener = () => {
      if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = requestAnimationFrame(() => this.updateView());
    };
    this.resizeListener = () => this.updateView();

    this.container.addEventListener('scroll', this.scrollListener, { passive: true });
    window.addEventListener('resize', this.resizeListener);
  }

  setNodes(nodes) {
    this.nodes = nodes;
    const totalHeight = this.nodes.length * this.rowHeight;
    this.totalHeightSpacer.style.height = `${totalHeight}px`;
    this.updateView();
  }

  getContentWrapper() {
    return this.contentWrapper;
  }

  updateView() {
    if (this.nodes.length === 0) {
      this.totalHeightSpacer.style.height = '0px';
      this.contentWrapper.style.transform = 'translate3d(0, 0, 0)';
      this.onRender([], 0);
      return;
    }

    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight || 600;

    const startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.buffer);
    const endIndex = Math.min(this.nodes.length, Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + this.buffer);

    const offsetY = startIndex * this.rowHeight;
    this.contentWrapper.style.transform = `translate3d(0, ${offsetY}px, 0)`;

    const visibleNodes = this.nodes.slice(startIndex, endIndex);
    this.onRender(visibleNodes, startIndex);
  }

  destroy() {
    this.container.removeEventListener('scroll', this.scrollListener);
    window.removeEventListener('resize', this.resizeListener);
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
  }
}

// --- 6. TREE VIEW CONTROLLER ---
class TreeView {
  constructor(options) {
    this.container = options.container;
    this.settings = options.settings;
    this.onToggleExpand = options.onToggleExpand;
    this.onCopyToast = options.onCopyToast;
    this.nodes = [];
    this.selectedNodeId = null;
    this.matchedIds = new Set();

    this.virtualizer = new Virtualizer({
      container: this.container,
      rowHeight: this.settings.virtualRowHeight,
      onRender: (visibleNodes, startIndex) => this.renderRows(visibleNodes, startIndex)
    });

    this.bindKeyboardNav();
  }

  setNodes(nodes, matchedIds = new Set()) {
    this.nodes = nodes;
    this.matchedIds = matchedIds;
    this.virtualizer.setNodes(nodes);
  }

  updateSettings(settings) {
    this.settings = settings;
    this.virtualizer.updateView();
  }

  bindKeyboardNav() {
    this.container.tabIndex = 0;
    this.container.addEventListener('keydown', (e) => {
      if (this.nodes.length === 0) return;
      const currentIndex = this.selectedNodeId ? this.nodes.findIndex((n) => n.id === this.selectedNodeId) : 0;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(this.nodes.length - 1, currentIndex + 1);
        this.selectedNodeId = this.nodes[nextIndex].id;
        this.scrollToSelected(nextIndex);
        this.virtualizer.updateView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(0, currentIndex - 1);
        this.selectedNodeId = this.nodes[prevIndex].id;
        this.scrollToSelected(prevIndex);
        this.virtualizer.updateView();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Enter') {
        const currentNode = this.nodes[currentIndex];
        if (currentNode && currentNode.hasChildren) {
          e.preventDefault();
          if (
            (e.key === 'ArrowRight' && !currentNode.isExpanded) ||
            (e.key === 'ArrowLeft' && currentNode.isExpanded) ||
            e.key === 'Enter'
          ) {
            this.onToggleExpand(currentNode.id);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this.selectedNodeId) {
        const selectedNode = this.nodes.find((n) => n.id === this.selectedNodeId);
        if (selectedNode) {
          e.preventDefault();
          const copyText = selectedNode.hasChildren ? selectedNode.path : String(selectedNode.value);
          navigator.clipboard.writeText(copyText);
          this.onCopyToast(`Copied: ${selectedNode.path}`);
        }
      }
    });
  }

  scrollToSelected(index) {
    const targetY = index * this.settings.virtualRowHeight;
    const viewportHeight = this.container.clientHeight;
    const currentScrollTop = this.container.scrollTop;

    if (targetY < currentScrollTop) {
      this.container.scrollTop = targetY;
    } else if (targetY + this.settings.virtualRowHeight > currentScrollTop + viewportHeight) {
      this.container.scrollTop = targetY + this.settings.virtualRowHeight - viewportHeight;
    }
  }

  renderRows(visibleNodes, startIndex) {
    const wrapper = this.virtualizer.getContentWrapper();
    wrapper.innerHTML = '';

    visibleNodes.forEach((node, i) => {
      const globalIndex = startIndex + i;
      const rowEl = document.createElement('div');
      rowEl.className = 'pjv-row';
      if (node.id === this.selectedNodeId) rowEl.classList.add('selected');
      if (node.diffStatus) rowEl.classList.add(`diff-${node.diffStatus}`);

      rowEl.style.height = `${this.settings.virtualRowHeight}px`;

      if (this.settings.showLineNumbers) {
        const lineNoEl = document.createElement('span');
        lineNoEl.className = 'pjv-line-no';
        lineNoEl.textContent = String(globalIndex + 1);
        rowEl.appendChild(lineNoEl);
      }

      const indentContainer = document.createElement('span');
      indentContainer.style.display = 'inline-flex';
      indentContainer.style.height = '100%';

      for (let d = 1; d < node.depth; d++) {
        const guide = document.createElement('span');
        guide.className = 'pjv-indent-guide';
        guide.style.width = `${this.settings.indentSize}px`;
        indentContainer.appendChild(guide);
      }
      rowEl.appendChild(indentContainer);

      const arrowEl = document.createElement('span');
      arrowEl.className = 'pjv-arrow';
      if (node.hasChildren) {
        arrowEl.textContent = '▶';
        if (node.isExpanded) arrowEl.classList.add('expanded');
      } else {
        arrowEl.style.visibility = 'hidden';
      }
      rowEl.appendChild(arrowEl);

      if (node.key !== null) {
        const keyEl = document.createElement('span');
        keyEl.className = 'pjv-key';
        keyEl.textContent = typeof node.key === 'number' ? `[${node.key}]` : `"${node.key}"`;
        if (this.matchedIds.has(node.id)) keyEl.classList.add('pjv-search-highlight');
        
        keyEl.ondblclick = (e) => {
          e.stopPropagation();
          const keyStr = String(node.key);
          navigator.clipboard.writeText(keyStr);
          this.onCopyToast(`Copied key "${keyStr}"`);
        };

        rowEl.appendChild(keyEl);

        const colonEl = document.createElement('span');
        colonEl.className = 'pjv-colon';
        colonEl.textContent = ':';
        rowEl.appendChild(colonEl);
      }

      const valEl = document.createElement('span');
      if (node.hasChildren) {
        valEl.className = 'pjv-val-summary';
        valEl.textContent = String(node.value);
      } else {
        valEl.className = `pjv-val-${node.type}`;
        valEl.textContent = node.type === 'string' ? `"${node.value}"` : String(node.value);
      }
      if (this.matchedIds.has(node.id)) valEl.classList.add('pjv-search-highlight');
      
      valEl.ondblclick = (e) => {
        e.stopPropagation();
        const rawVal = node.hasChildren ? JSON.stringify(node.value) : String(node.value);
        navigator.clipboard.writeText(rawVal);
        const snippet = rawVal.length > 25 ? rawVal.substring(0, 25) + '...' : rawVal;
        this.onCopyToast(`Copied value "${snippet}"`);
      };

      rowEl.appendChild(valEl);

      if (node.smart) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'pjv-smart-badge';
        badgeEl.textContent = node.smart.badge || node.smart.type.toUpperCase();
        badgeEl.title = node.smart.formatted || node.smart.raw;

        if (node.smart.type === 'url') {
          badgeEl.onclick = (e) => {
            e.stopPropagation();
            window.open(node.smart.raw, '_blank');
          };
        } else {
          badgeEl.onclick = (e) => {
            e.stopPropagation();
            alert(`${node.smart.badge}:\n\n${node.smart.formatted}`);
          };
        }
        rowEl.appendChild(badgeEl);
      }

      rowEl.onclick = () => {
        this.selectedNodeId = node.id;
        this.virtualizer.updateView();
        if (node.hasChildren) this.onToggleExpand(node.id);
      };

      rowEl.ondblclick = (e) => {
        e.stopPropagation();
        const rawVal = node.hasChildren ? JSON.stringify(node.value) : String(node.value);
        navigator.clipboard.writeText(rawVal);
        const snippet = rawVal.length > 25 ? rawVal.substring(0, 25) + '...' : rawVal;
        this.onCopyToast(`Copied value "${snippet}"`);
      };

      // Hover Quick Action Buttons
      const hoverActions = document.createElement('span');
      hoverActions.className = 'pjv-hover-actions';

      const copyValBtn = document.createElement('button');
      copyValBtn.className = 'pjv-action-btn';
      copyValBtn.textContent = '📋 Val';
      copyValBtn.title = 'Copy Value';
      copyValBtn.onclick = (e) => {
        e.stopPropagation();
        const rawVal = node.hasChildren ? JSON.stringify(node.value) : String(node.value);
        navigator.clipboard.writeText(rawVal);
        const snippet = rawVal.length > 25 ? rawVal.substring(0, 25) + '...' : rawVal;
        this.onCopyToast(`Copied value "${snippet}"`);
      };
      hoverActions.appendChild(copyValBtn);

      if (node.key !== null) {
        const copyKeyBtn = document.createElement('button');
        copyKeyBtn.className = 'pjv-action-btn';
        copyKeyBtn.textContent = '🔑 Key';
        copyKeyBtn.title = 'Copy Key';
        copyKeyBtn.onclick = (e) => {
          e.stopPropagation();
          const keyStr = String(node.key);
          navigator.clipboard.writeText(keyStr);
          this.onCopyToast(`Copied key "${keyStr}"`);
        };
        hoverActions.appendChild(copyKeyBtn);
      }

      const copyPathBtn = document.createElement('button');
      copyPathBtn.className = 'pjv-action-btn';
      copyPathBtn.textContent = '📍 Path';
      copyPathBtn.title = 'Copy JSONPath';
      copyPathBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(node.path);
        this.onCopyToast(`Copied path ${node.path}`);
      };
      hoverActions.appendChild(copyPathBtn);

      rowEl.appendChild(hoverActions);

      rowEl.oncontextmenu = (e) => {
        e.preventDefault();
        const copyChoice = prompt(`Action for ${node.path}:\n1. Copy Value\n2. Copy Key\n3. Copy JSONPath`, '1');
        if (copyChoice === '1') {
          const valStr = node.hasChildren ? JSON.stringify(node.value) : String(node.value);
          navigator.clipboard.writeText(valStr);
          const snippet = valStr.length > 25 ? valStr.substring(0, 25) + '...' : valStr;
          this.onCopyToast(`Copied value "${snippet}"`);
        } else if (copyChoice === '2' && node.key !== null) {
          const keyStr = String(node.key);
          navigator.clipboard.writeText(keyStr);
          this.onCopyToast(`Copied key "${keyStr}"`);
        } else if (copyChoice === '3') {
          navigator.clipboard.writeText(node.path);
          this.onCopyToast(`Copied path ${node.path}`);
        }
      };

      wrapper.appendChild(rowEl);
    });
  }
}

// --- 7. TOOLBAR CONTROLLER ---
class Toolbar {
  constructor(options) {
    this.container = options.container;
    this.currentMode = 'tree';
    this.filterMode = 'text';
    this.render(options);
  }

  render(opts) {
    this.container.className = 'pjv-toolbar';
    this.container.innerHTML = `
      <div class="pjv-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px;height:20px;">
          <path d="M8 3H6a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 0 2 2h2m8-18h2a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-2" />
        </svg>
        Pro JSON
      </div>

      <div class="pjv-btn-group">
        <button class="pjv-btn active" id="pjv-btn-tree">Tree</button>
        <button class="pjv-btn" id="pjv-btn-raw">Raw</button>
        <button class="pjv-btn" id="pjv-btn-diff">Diff</button>
      </div>

      <div class="pjv-search-box">
        <input type="text" id="pjv-search-input" placeholder="Search keys, values, or JSONPath (e.g. $.users[0])..." />
        <select id="pjv-filter-mode" style="background:transparent; border:none; color:var(--pjv-text-muted); font-size:11px; cursor:pointer;">
          <option value="text">Text</option>
          <option value="regex">Regex</option>
          <option value="jsonpath">JSONPath</option>
        </select>
      </div>

      <div class="pjv-btn-group">
        <button class="pjv-btn" id="pjv-btn-depth-1">D1</button>
        <button class="pjv-btn" id="pjv-btn-depth-2">D2</button>
        <button class="pjv-btn" id="pjv-btn-depth-3">D3</button>
        <button class="pjv-btn" id="pjv-btn-expand-all">Expand</button>
        <button class="pjv-btn" id="pjv-btn-collapse-all">Collapse</button>
      </div>

      <div class="pjv-btn-group">
        <button class="pjv-btn" id="pjv-btn-copy">Copy</button>
        <button class="pjv-btn" id="pjv-btn-download">Save</button>
        <button class="pjv-btn" id="pjv-btn-options">⚙️</button>
      </div>

      <div class="pjv-badge-local">
        <span>🔒</span> 100% Local
      </div>
    `;

    const treeBtn = this.container.querySelector('#pjv-btn-tree');
    const rawBtn = this.container.querySelector('#pjv-btn-raw');
    const diffBtn = this.container.querySelector('#pjv-btn-diff');

    const setView = (mode) => {
      this.currentMode = mode;
      [treeBtn, rawBtn, diffBtn].forEach((btn) => btn.classList.remove('active'));
      if (mode === 'tree') treeBtn.classList.add('active');
      if (mode === 'raw') rawBtn.classList.add('active');
      if (mode === 'diff') diffBtn.classList.add('active');
      opts.onViewModeChange(mode);
    };

    treeBtn.onclick = () => setView('tree');
    rawBtn.onclick = () => setView('raw');
    diffBtn.onclick = () => {
      setView('diff');
      opts.onOpenDiff();
    };

    const searchInput = this.container.querySelector('#pjv-search-input');
    const filterSelect = this.container.querySelector('#pjv-filter-mode');

    const emitSearch = () => {
      opts.onSearchChange(searchInput.value, filterSelect.value);
    };

    searchInput.oninput = emitSearch;
    filterSelect.onchange = emitSearch;

    this.container.querySelector('#pjv-btn-depth-1').onclick = () => opts.onExpandDepth(1);
    this.container.querySelector('#pjv-btn-depth-2').onclick = () => opts.onExpandDepth(2);
    this.container.querySelector('#pjv-btn-depth-3').onclick = () => opts.onExpandDepth(3);
    this.container.querySelector('#pjv-btn-expand-all').onclick = () => opts.onExpandAll();
    this.container.querySelector('#pjv-btn-collapse-all').onclick = () => opts.onCollapseAll();

    this.container.querySelector('#pjv-btn-copy').onclick = () => opts.onCopyAll();
    this.container.querySelector('#pjv-btn-download').onclick = () => opts.onDownload();
    this.container.querySelector('#pjv-btn-options').onclick = () => opts.onOpenOptions();
  }
}

// --- 8. DIFF COMPONENT ---
function openDiffModal(options) {
  const backdrop = document.createElement('div');
  backdrop.className = 'pjv-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'pjv-modal';
  modal.innerHTML = `
    <h3 style="margin-top:0; color:var(--pjv-syntax-key);">Diff Mode — Compare Secondary JSON</h3>
    <textarea id="pjv-diff-textarea" style="
      width: 100%; height: 220px; box-sizing: border-box;
      background: var(--pjv-bg-badge); color: var(--pjv-text-main);
      font-family: var(--pjv-font-mono); font-size: 12px; padding: 10px;
      border: 1px solid var(--pjv-border-color); border-radius: 6px; outline: none;
    " placeholder='{"status": "success", "data": ...}'></textarea>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button id="pjv-diff-cancel" class="pjv-btn">Cancel</button>
      <button id="pjv-diff-compare" class="pjv-btn active">Compare Diff</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const cancelBtn = modal.querySelector('#pjv-diff-cancel');
  const compareBtn = modal.querySelector('#pjv-diff-compare');
  const textarea = modal.querySelector('#pjv-diff-textarea');

  cancelBtn.onclick = () => backdrop.remove();
  compareBtn.onclick = () => {
    try {
      const secondaryData = JSON.parse(textarea.value);
      const { diffNodes, stats } = computeStructuralDiff(options.primaryData, secondaryData);
      options.onDiffReady(diffNodes, stats);
      backdrop.remove();
    } catch (err) {
      alert(`Invalid Secondary JSON: ${err.message}`);
    }
  };
}

// --- 9. APP INITIALIZATION & INJECTION ---
const DEFAULT_SETTINGS = {
  theme: 'system',
  defaultExpandDepth: 2,
  fontSize: 13,
  indentSize: 18,
  showLineNumbers: true,
  virtualRowHeight: 26,
  detectDates: true,
  detectJwt: true,
  detectUrls: true,
  detectBase64: true,
  detectSchemaHints: true,
  autoActivateOnJson: true
};

async function getSettings() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get('pro_json_settings');
      return { ...DEFAULT_SETTINGS, ...data.pro_json_settings };
    }
  } catch (err) {}
  return DEFAULT_SETTINGS;
}

// Global hook to launch scratchpad from options page hash
window.launchProJsonScratchpad = async (container) => {
  let sampleJsonStr = `{\n  "status": "success",\n  "code": 200,\n  "data": {\n    "user": {\n      "id": 1024,\n      "name": "Jane Doe",\n      "email": "jane.doe@example.com",\n      "created_at": "2026-08-08T21:00:00Z",\n      "timestamp": 1770000000,\n      "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"\n    },\n    "items": [\n      { "id": 1, "title": "Widget A", "price": 29.99 },\n      { "id": 2, "title": "Widget B", "price": 49.99 }\n    ]\n  }\n}`;

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const { pjv_scratchpad_json } = await chrome.storage.local.get('pjv_scratchpad_json');
    if (pjv_scratchpad_json) sampleJsonStr = pjv_scratchpad_json;
  }

  renderApp(container, sampleJsonStr);
};

function renderApp(mountTarget, rawJsonText) {
  let jsonObject = parseJson(rawJsonText);
  getSettings().then((settings) => {
    document.documentElement.setAttribute('data-theme', settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : settings.theme);

    const root = document.createElement('div');
    root.className = 'pjv-root';

    const toolbarContainer = document.createElement('div');
    const viewportContainer = document.createElement('div');
    viewportContainer.className = 'pjv-viewport';

    const rawContainer = document.createElement('textarea');
    rawContainer.className = 'pjv-raw-textarea';
    rawContainer.value = JSON.stringify(jsonObject, null, 2);
    rawContainer.style.display = 'none';

    root.appendChild(toolbarContainer);
    root.appendChild(viewportContainer);
    root.appendChild(rawContainer);
    mountTarget.appendChild(root);

    // Toast
    const toastEl = document.createElement('div');
    toastEl.className = 'pjv-toast';
    document.body.appendChild(toastEl);
    const showToast = (msg) => {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      setTimeout(() => toastEl.classList.remove('show'), 2000);
    };

    let expandedStateMap = new Map();
    let currentNodes = buildFlatNodes(jsonObject, settings.defaultExpandDepth, expandedStateMap);
    let activeQuery = '';
    let activeMode = 'text';

    const treeView = new TreeView({
      container: viewportContainer,
      settings,
      onToggleExpand: (nodeId) => {
        const node = currentNodes.find((n) => n.id === nodeId);
        if (node) {
          expandedStateMap.set(nodeId, !node.isExpanded);
          currentNodes = buildFlatNodes(jsonObject, settings.defaultExpandDepth, expandedStateMap);
          applyRender();
        }
      },
      onCopyToast: showToast
    });

    const applyRender = () => {
      const { matchedIds, expandAncestorIds } = searchTree(currentNodes, activeQuery, activeMode);
      if (activeQuery.trim()) {
        expandAncestorIds.forEach((id) => expandedStateMap.set(id, true));
        currentNodes = buildFlatNodes(jsonObject, settings.defaultExpandDepth, expandedStateMap);
      }
      treeView.setNodes(currentNodes, matchedIds);
    };

    new Toolbar({
      container: toolbarContainer,
      onViewModeChange: (mode) => {
        if (mode === 'raw') {
          viewportContainer.style.display = 'none';
          rawContainer.style.display = 'block';
        } else {
          rawContainer.style.display = 'none';
          viewportContainer.style.display = 'block';
        }
      },
      onSearchChange: (query, mode) => {
        activeQuery = query;
        activeMode = mode;
        applyRender();
      },
      onExpandDepth: (depth) => {
        expandedStateMap.clear();
        currentNodes = buildFlatNodes(jsonObject, depth, expandedStateMap);
        applyRender();
      },
      onCollapseAll: () => {
        expandedStateMap.clear();
        currentNodes = buildFlatNodes(jsonObject, 0, expandedStateMap);
        applyRender();
      },
      onExpandAll: () => {
        expandedStateMap.clear();
        currentNodes = buildFlatNodes(jsonObject, 100, expandedStateMap);
        applyRender();
      },
      onCopyAll: () => {
        navigator.clipboard.writeText(JSON.stringify(jsonObject, null, 2));
        showToast('Copied JSON!');
      },
      onDownload: () => {
        const blob = new Blob([JSON.stringify(jsonObject, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pro-json-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Saved JSON file!');
      },
      onOpenDiff: () => {
        openDiffModal({
          primaryData: jsonObject,
          onDiffReady: (diffNodes, stats) => {
            currentNodes = diffNodes;
            treeView.setNodes(diffNodes);
            showToast(`Diff stats: +${stats.added} -${stats.removed} ~${stats.modified}`);
          }
        });
      },
      onOpenOptions: () => {
        if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          alert('Options is only available inside extension page context.');
        }
      }
    });

    applyRender();
  });
}

function initProJsonViewer() {
  // Only inject on page responses if inside extension environment
  if (typeof chrome === 'undefined' || !chrome.runtime) return;
  if (window.location.protocol === 'chrome-extension:') return; // Options page or popup page context

  if (document.body && document.body.classList.contains('pjv-injected')) return;

  const rawText = extractRawJsonText();
  if (!rawText) return;

  // Validate JSON syntax before loading UI
  try {
    JSON.parse(rawText);
  } catch (err) {
    try {
      parseJson(rawText);
    } catch {
      return;
    }
  }

  getSettings().then((settings) => {
    if (!settings.autoActivateOnJson) return;

    // Inject stylesheet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('theme.css');
    document.head.appendChild(link);

    // Setup viewport
    document.body.classList.add('pjv-injected');
    document.body.innerHTML = '';
    
    renderApp(document.body, rawText);
  });
}

function extractRawJsonText() {
  const contentType = document.contentType || '';
  const isJsonHeader =
    contentType.includes('application/json') ||
    contentType.includes('text/json') ||
    contentType.includes('application/x-json');

  const isJsonFileExt = window.location.pathname.endsWith('.json');

  if (isJsonHeader || isJsonFileExt) {
    const pre = document.querySelector('body > pre');
    if (pre) return pre.textContent;
    return document.body.innerText;
  }

  const bodyText = document.body.innerText.trim();
  if ((bodyText.startsWith('{') && bodyText.endsWith('}')) || (bodyText.startsWith('[') && bodyText.endsWith(']'))) {
    if (bodyText.length < 5000000) {
      try {
        JSON.parse(bodyText);
        return bodyText;
      } catch (e) {}
    }
  }
  return null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProJsonViewer);
} else {
  initProJsonViewer();
}
