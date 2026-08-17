/**
 * Pro JSON Viewer — Content Script & Core UI Engine
 * (Zero-build fully self-contained ES5/ES6 Vanilla JS script)
 */

// --- 0. ROBUST CLIPBOARD HELPER (HTTP & HTTPS) ---
function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(function() {
      return fallbackCopy(text);
    });
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  return new Promise(function(resolve, reject) {
    try {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      var success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) resolve();
      else reject(new Error('Copy failed'));
    } catch (err) {
      reject(err);
    }
  });
}

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
          copyToClipboard(copyText);
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
          copyToClipboard(keyStr);
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
        copyToClipboard(rawVal);
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
        copyToClipboard(rawVal);
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
        copyToClipboard(rawVal);
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
          copyToClipboard(keyStr);
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
        copyToClipboard(node.path);
        this.onCopyToast(`Copied path ${node.path}`);
      };
      hoverActions.appendChild(copyPathBtn);

      rowEl.appendChild(hoverActions);

      rowEl.oncontextmenu = (e) => {
        e.preventDefault();
        const copyChoice = prompt(`Action for ${node.path}:\n1. Copy Value\n2. Copy Key\n3. Copy JSONPath`, '1');
        if (copyChoice === '1') {
          const valStr = node.hasChildren ? JSON.stringify(node.value) : String(node.value);
          copyToClipboard(valStr);
          const snippet = valStr.length > 25 ? valStr.substring(0, 25) + '...' : valStr;
          this.onCopyToast(`Copied value "${snippet}"`);
        } else if (copyChoice === '2' && node.key !== null) {
          const keyStr = String(node.key);
          copyToClipboard(keyStr);
          this.onCopyToast(`Copied key "${keyStr}"`);
        } else if (copyChoice === '3') {
          copyToClipboard(node.path);
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
        <button class="pjv-btn" id="pjv-btn-table">Table</button>
        <button class="pjv-btn" id="pjv-btn-chart">Chart 📊</button>
        <button class="pjv-btn" id="pjv-btn-diagram">Diagram 🗺️</button>
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
        <button class="pjv-btn" id="pjv-btn-tools" title="TypeScript/Zod Schema Generator & Exporter">🛠️ Tools</button>
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

    const treeBtn = this.container.querySelector('#pjv-btn-tree');
    const tableBtn = this.container.querySelector('#pjv-btn-table');
    const chartBtn = this.container.querySelector('#pjv-btn-chart');
    const diagramBtn = this.container.querySelector('#pjv-btn-diagram');
    const rawBtn = this.container.querySelector('#pjv-btn-raw');
    const diffBtn = this.container.querySelector('#pjv-btn-diff');

    const setView = (mode) => {
      this.currentMode = mode;
      [treeBtn, tableBtn, chartBtn, diagramBtn, rawBtn, diffBtn].forEach((btn) => btn.classList.remove('active'));
      if (mode === 'tree') treeBtn.classList.add('active');
      if (mode === 'table') tableBtn.classList.add('active');
      if (mode === 'chart') chartBtn.classList.add('active');
      if (mode === 'diagram') diagramBtn.classList.add('active');
      if (mode === 'raw') rawBtn.classList.add('active');
      if (mode === 'diff') diffBtn.classList.add('active');
      opts.onViewModeChange(mode);
    };

    treeBtn.onclick = () => setView('tree');
    tableBtn.onclick = () => setView('table');
    chartBtn.onclick = () => setView('chart');
    diagramBtn.onclick = () => setView('diagram');
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

    const toolsBtn = this.container.querySelector('#pjv-btn-tools');
    if (toolsBtn && opts.onOpenTools) {
      toolsBtn.onclick = () => opts.onOpenTools();
    }

    const statsBadge = this.container.querySelector('#pjv-badge-stats');
    if (statsBadge && opts.onOpenTools) {
      statsBadge.onclick = () => opts.onOpenTools();
    }

    this.container.querySelector('#pjv-btn-copy').onclick = () => opts.onCopyAll();
    this.container.querySelector('#pjv-btn-download').onclick = () => opts.onDownload();
    this.container.querySelector('#pjv-btn-options').onclick = () => opts.onOpenOptions();

    const themeSelect = this.container.querySelector('#pjv-toolbar-theme');
    if (opts.currentTheme) themeSelect.value = opts.currentTheme;
    themeSelect.onchange = () => {
      if (opts.onThemeChange) opts.onThemeChange(themeSelect.value);
    };
  }
}

// --- 7.5. TABLE VIEW COMPONENT ---
function extractSummaryMetrics(data, currentPath = '$', results = []) {
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

function formatTabTitle(path, parentObj) {
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

function findAllArraysOfObjects(data, currentPath = '$', results = [], parentObj = null, maxDepth = 20) {
  if (!data || maxDepth < 0) return results;

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

class TableView {
  constructor(options) {
    this.container = options.container;
    this.rawData = options.data;
    this.scanDepth = options.scanDepth || 3;
    this.onCopyToast = options.onCopyToast;
    this.datasets = [];
    this.activeTabId = '';
    this.currentArray = [];
    this.columns = [];
    this.sortColumn = null;
    this.sortAsc = true;
    this.searchQuery = '';

    this.initDatasets();
    this.render();
  }

  initDatasets() {
    this.datasets = [];

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

    const rawArrays = findAllArraysOfObjects(this.rawData, '$', [], null, this.scanDepth);

    const seenIds = new Set();
    const uniqueArrays = [];
    rawArrays.forEach((ds) => {
      if (!seenIds.has(ds.id)) {
        seenIds.add(ds.id);
        uniqueArrays.push(ds);
      }
    });

    const questionDatasets = uniqueArrays.filter((d) => d.id.includes('.questions'));
    if (questionDatasets.length >= 1) {
      const allQuestions = [];
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

  loadActiveTab() {
    const active = this.datasets.find((d) => d.id === this.activeTabId);
    if (!active) return;

    this.currentArray = active.array;
    this.extractColumns();
    this.sortColumn = null;
    this.sortAsc = true;
  }

  extractColumns() {
    const keysSet = new Set();
    this.currentArray.forEach((row) => {
      if (typeof row === 'object' && row !== null) {
        Object.keys(row).forEach((k) => keysSet.add(k));
      }
    });
    this.columns = Array.from(keysSet);
  }

  render() {
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

    const activeDataset = this.datasets.find((d) => d.id === this.activeTabId);
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

    const dotElements = [];
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

    const updateTooltipPos = (val) => {
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

    const updateDots = (val) => {
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

    const tbody = document.createElement('tbody');
    tbody.id = 'pjv-table-tbody';
    table.appendChild(tbody);

    tableWrapper.appendChild(table);
    wrapper.appendChild(tableWrapper);
    this.container.appendChild(wrapper);

    this.updateBody();
  }

  getFilteredRows() {
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

  updateBody() {
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

  renderSmartCell(val, colKey) {
    if (val === null || val === undefined) {
      return `<span class="pjv-table-cell-null">null</span>`;
    }

    if (typeof val === 'boolean') {
      return `<span class="pjv-table-cell-boolean">${val}</span>`;
    }

    const colLower = colKey.toLowerCase();

    let parsedVal = val;
    if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
      try { parsedVal = JSON.parse(val); } catch (e) {}
    }

    if (colLower === 'type' && typeof val === 'string') {
      if (val === 'single-choice') return `<span class="pjv-pill pjv-type-single">🟢 ${val}</span>`;
      if (val === 'multiple-choice') return `<span class="pjv-pill pjv-type-multiple">🟣 ${val}</span>`;
      if (val === 'dropdown') return `<span class="pjv-pill pjv-type-dropdown">🔵 ${val}</span>`;
      if (val === 'ranking') return `<span class="pjv-pill pjv-type-ranking">🟡 ${val}</span>`;
      return `<span class="pjv-pill pjv-type-text">⚪ ${val}</span>`;
    }

    if ((colLower === 'questions' || colLower === 'skill_levels') && Array.isArray(parsedVal)) {
      return `<span class="pjv-table-cell-json" style="background: var(--pjv-badge-local-bg); color: var(--pjv-badge-local-text); border: 1px solid var(--pjv-badge-local-border); font-weight:600;">❓ ${parsedVal.length} ${colKey}</span>`;
    }

    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'low') return `<span class="pjv-pill pjv-pill-low">🟢 Low</span>`;
      if (lower === 'medium') return `<span class="pjv-pill pjv-pill-medium">🟠 Medium</span>`;
      if (lower === 'high' || lower === 'critical') return `<span class="pjv-pill pjv-pill-high">🔴 ${val}</span>`;
    }

    if (colLower === 'expected' && typeof parsedVal === 'object' && parsedVal !== null) {
      if (parsedVal.correct) {
        const correctVal = Array.isArray(parsedVal.correct) ? parsedVal.correct.join(', ') : parsedVal.correct;
        return `<span class="pjv-pill pjv-type-single" style="font-family:var(--pjv-font-mono);">Key: ${correctVal}</span>`;
      }
    }

    if (colLower === 'options' && Array.isArray(parsedVal)) {
      const optionDetails = parsedVal.map((o) => `${o.option || '•'}: ${o.text || ''} (${o.score ?? 0}pt)`).join('\n');
      return `<span class="pjv-table-cell-json" title="${this.escapeHtml(optionDetails)}">📋 ${parsedVal.length} options</span>`;
    }

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

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  exportCsv() {
    const filtered = this.getFilteredRows();
    if (filtered.length === 0) return;

    const csvRows = [];
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

// --- 7.6. CHART VIEW COMPONENT ---
const CHART_PALETTE = [
  '#0284c7', // Sky Blue
  '#22c55e', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#6366f1'  // Indigo
];

function formatNumericValue(val) {
  if (isNaN(val) || !isFinite(val)) return '0';
  if (Number.isInteger(val)) return String(val);
  return Number(val.toFixed(2)).toString();
}

function isIdField(key) {
  const k = String(key).toLowerCase();
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

function formatChartTitle(path, parentObj) {
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

function discoverChartDatasets(data, currentPath = '$', results = [], parentObj = null, maxDepth = 3) {
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

function extractNonIdKpis(data, currentPath = '$', results = []) {
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

class ChartView {
  constructor(options) {
    this.container = options.container;
    this.rawData = options.data;
    this.scanDepth = options.scanDepth || 3;
    this.datasets = [];
    this.activeTabId = '';
    this.selectedChartType = 'vbar';
    this.selectedLabelKey = '';
    this.selectedValueKey = '';
    this.aggregationMode = 'raw';
    this.topNLimit = 0;

    this.initDatasets();
    this.render();
  }

  initDatasets() {
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
    const seenIds = new Set();
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

  configureTabDefaults() {
    const active = this.datasets.find((d) => d.id === this.activeTabId);
    if (!active) return;

    if (active.type === 'array' && active.array && active.array.length > 0) {
      const strKeys = active.stringKeys || Object.keys(active.array[0]);
      const numKeys = active.numericKeys || Object.keys(active.array[0]).filter((k) => typeof active.array[0][k] === 'number' && !isIdField(k));

      this.selectedLabelKey = strKeys.find((k) => !isIdField(k) && typeof active.array[0][k] === 'string') || strKeys[0] || '';
      this.selectedValueKey = numKeys[0] || strKeys.find((k) => !isIdField(k) && typeof active.array[0][k] === 'number') || '';
      this.aggregationMode = numKeys.length > 0 ? 'raw' : 'count';
      this.selectedChartType = 'vbar';
      this.topNLimit = 0;
    } else if (active.type === 'breakdown') {
      this.selectedChartType = 'donut';
    }
  }

  buildMagneticSlider() {
    const depthContainer = document.createElement('div');
    depthContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--pjv-text-muted);';

    const depthLabel = document.createElement('span');
    depthLabel.innerHTML = `Depth: <strong style="color:var(--pjv-syntax-key);">${this.scanDepth}</strong>`;
    depthContainer.appendChild(depthLabel);

    const dotSliderWrapper = document.createElement('div');
    dotSliderWrapper.className = 'pjv-magnetic-dot-slider';

    const dotTrack = document.createElement('div');
    dotTrack.className = 'pjv-dot-slider-track';

    const dotElements = [];
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

    const updateTooltipPos = (val) => {
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

  render() {
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

    const activeDataset = this.datasets.find((d) => d.id === this.activeTabId);

    // 2. Interactive Controls Bar (for array datasets)
    if (activeDataset && activeDataset.type === 'array' && activeDataset.array) {
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
        this.aggregationMode = modeSelect.value;
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

      // Chart Type Switcher Buttons
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

      controlsBar.appendChild(leftGroup);
      controlsBar.appendChild(typeBtnGroup);
      wrapper.appendChild(controlsBar);
    }

    const chartDisplayArea = document.createElement('div');
    wrapper.appendChild(chartDisplayArea);

    this.container.appendChild(wrapper);
    if (activeDataset) {
      this.renderChartBody(chartDisplayArea, activeDataset);
    }
  }

  updateTypeButtons(btnGroup, activeBtn) {
    const btns = btnGroup.querySelectorAll('.pjv-btn');
    btns.forEach((btn) => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  renderChartBody(displayArea, dataset) {
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
      let items = [];
      const labelKey = this.selectedLabelKey || Object.keys(dataset.array[0])[0];

      if (this.aggregationMode === 'count') {
        const countsMap = new Map();
        dataset.array.forEach((row) => {
          const catName = String(row[labelKey] || 'Unspecified');
          countsMap.set(catName, (countsMap.get(catName) || 0) + 1);
        });
        countsMap.forEach((count, cat) => items.push({ label: cat, value: count }));
        items.sort((a, b) => b.value - a.value);
      } else {
        const valKey = this.selectedValueKey || Object.keys(dataset.array[0]).find((k) => typeof dataset.array[0][k] === 'number' && !isIdField(k)) || labelKey;
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

  renderSummaryStats(items) {
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

  renderSvgDonut(slices) {
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
      const color = CHART_PALETTE[i % CHART_PALETTE.length];

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

  renderLegend(slices) {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const legendItems = slices.map((slice, i) => {
      const color = CHART_PALETTE[i % CHART_PALETTE.length];
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

  renderSvgBarChart(items, isVertical = false) {
    const maxVal = Math.max(...items.map((i) => i.value), 1);

    if (isVertical) {
      const barCols = items.map((item, i) => {
        const color = CHART_PALETTE[i % CHART_PALETTE.length];
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
      const color = CHART_PALETTE[i % CHART_PALETTE.length];
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

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// --- 7.7. INTERACTIVE DIAGRAM & VISUAL GRAPH VIEW ---
class DiagramView {
  constructor(options) {
    this.container = options.container;
    this.rawData = options.data;
    this.currentDepth = options.defaultDepth || 2;
    this.onToast = options.onToast;

    this.rootNode = null;
    this.orientation = 'horizontal';
    this.expandedMap = new Map();
    this.searchQuery = '';

    this.zoom = 1;
    this.panX = 60;
    this.panY = 60;
    this.isDragging = false;
    this.startDragX = 0;
    this.startDragY = 0;

    this.wrapperEl = null;
    this.viewportEl = null;
    this.canvasLayerEl = null;
    this.svgLayerEl = null;
    this.nodesLayerEl = null;
    this.searchInputEl = null;

    this.initGraph();
    this.renderShell();
    this.renderCanvas();
  }

  initGraph() {
    this.rootNode = this.buildNode(this.rawData, 'root', 1, 'root');
  }

  buildNode(value, key, depth, id) {
    const isArray = Array.isArray(value);
    const isObj = typeof value === 'object' && value !== null && !isArray;
    const isExpanded = this.expandedMap.has(id)
      ? this.expandedMap.get(id)
      : depth <= this.currentDepth;

    const primitiveProps = [];
    const children = [];
    let valueSummary = '';

    if (isArray) {
      valueSummary = `[ ${value.length} items ]`;
      value.forEach((item, idx) => {
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

  computeLayout() {
    if (!this.rootNode) return;
    if (this.orientation === 'horizontal') {
      this.layoutHorizontal(this.rootNode);
      this.assignPositionsHorizontal(this.rootNode, 0, 0);
    } else {
      this.layoutVertical(this.rootNode);
      this.assignPositionsVertical(this.rootNode, 0, 0);
    }
  }

  layoutHorizontal(node) {
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

  assignPositionsHorizontal(node, currentX, startY) {
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

  layoutVertical(node) {
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

  assignPositionsVertical(node, startX, currentY) {
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

  renderShell() {
    this.container.innerHTML = '';

    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'pjv-diagram-container';

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
          <button id="pjv-diag-d1" class="pjv-btn">D1</button>
          <button id="pjv-diag-d2" class="pjv-btn">D2</button>
          <button id="pjv-diag-d3" class="pjv-btn">D3</button>
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

  renderCanvas() {
    if (!this.svgLayerEl || !this.nodesLayerEl || !this.canvasLayerEl) return;

    this.computeLayout();
    this.svgLayerEl.innerHTML = '';
    this.nodesLayerEl.innerHTML = '';

    const allNodes = [];
    const collect = (n) => {
      allNodes.push(n);
      if (n.isExpanded) {
        n.children.forEach(collect);
      }
    };
    if (this.rootNode) collect(this.rootNode);

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
          this.svgLayerEl.appendChild(path);
        });
      }
    });

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

      this.nodesLayerEl.appendChild(card);
    });

    this.updateCanvasTransform(this.canvasLayerEl);
  }

  isNodeMatched(node) {
    if (!this.searchQuery) return false;
    return (
      node.key.toLowerCase().includes(this.searchQuery) ||
      node.primitiveProps.some((p) => p.key.toLowerCase().includes(this.searchQuery) || p.val.toLowerCase().includes(this.searchQuery))
    );
  }

  updateSearchHighlights() {
    if (!this.nodesLayerEl) return;
    const allNodes = [];
    const collect = (n) => {
      allNodes.push(n);
      if (n.isExpanded) n.children.forEach(collect);
    };
    if (this.rootNode) collect(this.rootNode);

    const nodeMap = new Map();
    allNodes.forEach((n) => nodeMap.set(n.id, n));

    const cardEls = this.nodesLayerEl.querySelectorAll('.pjv-diagram-node');
    cardEls.forEach((card) => {
      const id = card.dataset.nodeId;
      const node = id ? nodeMap.get(id) : null;
      if (node && this.isNodeMatched(node)) {
        card.classList.add('pjv-highlight');
      } else {
        card.classList.remove('pjv-highlight');
      }
    });
  }

  updateCanvasTransform(canvas) {
    canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    canvas.style.transformOrigin = '0 0';
  }

  bindCanvasInteractions(viewport, canvas) {
    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.pjv-diagram-node')) return;
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

  bindControls(controls, canvas) {
    controls.querySelector('#pjv-diag-zoom-in').addEventListener('click', () => {
      this.zoom = Math.min(2.5, this.zoom * 1.2);
      this.updateCanvasTransform(canvas);
    });

    controls.querySelector('#pjv-diag-zoom-out').addEventListener('click', () => {
      this.zoom = Math.max(0.2, this.zoom / 1.2);
      this.updateCanvasTransform(canvas);
    });

    controls.querySelector('#pjv-diag-zoom-reset').addEventListener('click', () => {
      this.zoom = 1;
      this.panX = 60;
      this.panY = 60;
      this.updateCanvasTransform(canvas);
    });

    controls.querySelector('#pjv-diag-fit').addEventListener('click', () => {
      this.fitToScreen(canvas);
    });

    const hBtn = controls.querySelector('#pjv-diag-orient-h');
    const vBtn = controls.querySelector('#pjv-diag-orient-v');

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

    controls.querySelector('#pjv-diag-d1').addEventListener('click', () => this.setExpandDepth(1));
    controls.querySelector('#pjv-diag-d2').addEventListener('click', () => this.setExpandDepth(2));
    controls.querySelector('#pjv-diag-d3').addEventListener('click', () => this.setExpandDepth(3));
    controls.querySelector('#pjv-diag-expand').addEventListener('click', () => this.setExpandDepth(100));
    controls.querySelector('#pjv-diag-collapse').addEventListener('click', () => this.setExpandDepth(0));

    this.searchInputEl = controls.querySelector('#pjv-diag-search');
    this.searchInputEl.value = this.searchQuery;
    this.searchInputEl.addEventListener('input', () => {
      this.searchQuery = this.searchInputEl.value.trim().toLowerCase();
      this.updateSearchHighlights();
    });

    controls.querySelector('#pjv-diag-exp-svg').addEventListener('click', () => this.exportSvg());
    controls.querySelector('#pjv-diag-exp-png').addEventListener('click', () => this.exportPng());
  }

  setExpandDepth(depth) {
    this.expandedMap.clear();
    this.currentDepth = depth;
    this.initGraph();
    this.renderCanvas();
  }

  fitToScreen(canvas) {
    if (!this.rootNode) return;
    this.zoom = 0.85;
    this.panX = 40;
    this.panY = 40;
    this.updateCanvasTransform(canvas);
  }

  generateCompleteSvgString() {
    if (!this.rootNode) return null;

    const allNodes = [];
    const collect = (n) => {
      allNodes.push(n);
      if (n.isExpanded) n.children.forEach(collect);
    };
    collect(this.rootNode);

    if (allNodes.length === 0) return null;

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

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bgMain = isDark ? '#14141e' : '#f8fafc';
    const bgBadge = isDark ? '#1e1e2d' : '#ffffff';
    const borderColor = isDark ? '#2e2e44' : '#e2e8f0';
    const textMain = isDark ? '#f1f5f9' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const syntaxKey = isDark ? '#38bdf8' : '#0284c7';
    const syntaxString = isDark ? '#4ade80' : '#16a34a';

    const isH = this.orientation === 'horizontal';
    const edgesHtml = [];

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

    const nodesHtml = [];
    allNodes.forEach((node) => {
      const nx = node.x + offsetX;
      const ny = node.y + offsetY;
      const typeBadge = node.type === 'array' ? 'ARRAY' : (node.type === 'object' ? 'OBJECT' : 'VALUE');
      const badgeColor = node.type === 'array' ? '#f59e0b' : (node.type === 'object' ? syntaxKey : syntaxString);
      const badgeWidth = 48;

      const visibleProps = node.primitiveProps.slice(0, 6);
      const hasProps = visibleProps.length > 0;

      const propsLines = [];
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

  exportSvg() {
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

  exportPng() {
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

// --- 8.5. DEVELOPER TOOLS & SCHEMA GENERATOR SUITE ---
function truncate(str, maxLen = 14) {
  if (!str) return '';
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatByteSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function analyzePayloadStats(rawText, data, parseTimeMs = 0) {
  const byteSize = new Blob([rawText || JSON.stringify(data)]).size;
  let totalKeys = 0;
  let arrayCount = 0;
  let maxDepth = 0;

  function traverse(obj, depth = 1) {
    if (depth > maxDepth) maxDepth = depth;
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      arrayCount++;
      obj.forEach((item) => traverse(item, depth + 1));
    } else {
      const keys = Object.keys(obj);
      totalKeys += keys.length;
      keys.forEach((k) => traverse(obj[k], depth + 1));
    }
  }

  traverse(data, 1);

  return {
    byteSize,
    formattedSize: formatByteSize(byteSize),
    totalKeys,
    arrayCount,
    maxDepth,
    parseTimeMs: Math.round(parseTimeMs * 100) / 100
  };
}

function toPascalCase(str) {
  return String(str)
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[^a-zA-Z]+/, '')
    .replace(/^[a-z]/, (c) => c.toUpperCase()) || 'Item';
}

function sanitizeIdentifier(str) {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str)) {
    return str;
  }
  return JSON.stringify(str);
}

function generateTypeScript(data, rootName = 'RootObject') {
  if (data === null || data === undefined) return `export type ${rootName} = null;`;
  if (typeof data !== 'object') return `export type ${rootName} = ${typeof data};`;

  const interfaces = new Map();

  function getTypeName(key) {
    let name = toPascalCase(key);
    if (!name) name = 'NestedObject';
    return name;
  }

  function inferType(val, propertyKey = 'item') {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';

    const type = typeof val;
    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';

    if (Array.isArray(val)) {
      if (val.length === 0) return 'any[]';
      const elemTypes = new Set();
      val.forEach((elem) => elemTypes.add(inferType(elem, propertyKey)));
      const combined = Array.from(elemTypes).join(' | ');
      return elemTypes.size > 1 ? `(${combined})[]` : `${combined}[]`;
    }

    const interfaceName = getTypeName(propertyKey);
    buildInterface(val, interfaceName);
    return interfaceName;
  }

  function buildInterface(obj, name) {
    if (interfaces.has(name)) return;
    interfaces.set(name, '');

    const lines = [];
    lines.push(`export interface ${name} {`);

    const keys = Object.keys(obj);
    if (keys.length === 0) {
      lines.push('  [key: string]: any;');
    } else {
      keys.forEach((key) => {
        const val = obj[key];
        const fieldName = sanitizeIdentifier(key);
        const inferred = inferType(val, key);
        lines.push(`  ${fieldName}: ${inferred};`);
      });
    }

    lines.push('}');
    interfaces.set(name, lines.join('\n'));
  }

  if (Array.isArray(data)) {
    const itemType = inferType(data[0], `${rootName}Item`);
    const output = [];
    interfaces.forEach((code) => output.push(code));
    output.push(`export type ${rootName} = ${itemType}[];`);
    return output.join('\n\n');
  }

  buildInterface(data, rootName);
  const result = [];
  interfaces.forEach((code) => result.push(code));
  return result.join('\n\n');
}

function generateZodSchema(data, rootName = 'rootSchema') {
  if (data === null || data === undefined) return `import { z } from 'zod';\n\nexport const ${rootName} = z.null();`;
  if (typeof data !== 'object') return `import { z } from 'zod';\n\nexport const ${rootName} = z.${typeof data}();`;

  const schemas = new Map();

  function getSchemaName(key) {
    const pascal = toPascalCase(key);
    return `${pascal.charAt(0).toLowerCase() + pascal.slice(1)}Schema`;
  }

  function inferZod(val, propertyKey = 'item') {
    if (val === null) return 'z.null()';
    if (val === undefined) return 'z.undefined()';

    const type = typeof val;
    if (type === 'string') return 'z.string()';
    if (type === 'number') return 'z.number()';
    if (type === 'boolean') return 'z.boolean()';

    if (Array.isArray(val)) {
      if (val.length === 0) return 'z.array(z.any())';
      const inner = inferZod(val[0], propertyKey);
      return `z.array(${inner})`;
    }

    const schemaName = getSchemaName(propertyKey);
    buildZodObject(val, schemaName);
    return schemaName;
  }

  function buildZodObject(obj, name) {
    if (schemas.has(name)) return;
    schemas.set(name, '');

    const lines = [];
    lines.push(`export const ${name} = z.object({`);

    const keys = Object.keys(obj);
    keys.forEach((key) => {
      const val = obj[key];
      const fieldName = sanitizeIdentifier(key);
      const inferred = inferZod(val, key);
      lines.push(`  ${fieldName}: ${inferred},`);
    });

    lines.push('});');
    schemas.set(name, lines.join('\n'));
  }

  if (Array.isArray(data)) {
    const itemSchema = inferZod(data[0], `${rootName}Item`);
    const output = ["import { z } from 'zod';\n"];
    schemas.forEach((code) => output.push(code));
    output.push(`export const ${rootName} = z.array(${itemSchema});`);
    return output.join('\n\n');
  }

  buildZodObject(data, rootName);
  const result = ["import { z } from 'zod';\n"];
  schemas.forEach((code) => result.push(code));
  return result.join('\n\n');
}

function jsonToYaml(data, indentLevel = 0) {
  const indent = '  '.repeat(indentLevel);

  if (data === null) return 'null';
  if (data === undefined) return '~';
  if (typeof data === 'boolean') return data ? 'true' : 'false';
  if (typeof data === 'number') return String(data);

  if (typeof data === 'string') {
    if (data.includes('\n')) {
      return `|\n${data.split('\n').map((line) => `${indent}  ${line}`).join('\n')}`;
    }
    if (/[:#\[\]{},&*?|<>=!%@`]|^[0-9]/.test(data) || data === 'true' || data === 'false' || data === 'null') {
      return JSON.stringify(data);
    }
    return data;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    return data.map((item) => {
      if (typeof item === 'object' && item !== null) {
        const itemYaml = jsonToYaml(item, indentLevel + 1).trimStart();
        return `${indent}- ${itemYaml}`;
      }
      return `${indent}- ${jsonToYaml(item, indentLevel + 1)}`;
    }).join('\n');
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return '{}';

    return keys.map((key) => {
      const val = data[key];
      const safeKey = /[:#\[\]{},&*?|<>=!%@`\s]/.test(key) ? JSON.stringify(key) : key;

      if (typeof val === 'object' && val !== null && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0)) {
        return `${indent}${safeKey}:\n${jsonToYaml(val, indentLevel + 1)}`;
      }
      return `${indent}${safeKey}: ${jsonToYaml(val, indentLevel + 1)}`;
    }).join('\n');
  }

  return String(data);
}

function jsonToCsv(data) {
  if (!data) return '';

  function findPrimaryArray(obj) {
    if (Array.isArray(obj)) return obj;
    if (typeof obj === 'object' && obj !== null) {
      for (const k of Object.keys(obj)) {
        if (Array.isArray(obj[k]) && obj[k].length > 0) {
          return obj[k];
        }
      }
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'object' && obj[k] !== null) {
          const nested = findPrimaryArray(obj[k]);
          if (nested) return nested;
        }
      }
    }
    return null;
  }

  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      str = `"${str.replace(/"/g, '""')}"`;
    } else {
      str = `"${str}"`;
    }
    return str;
  }

  const primaryArray = findPrimaryArray(data);

  if (primaryArray && primaryArray.length > 0) {
    const headerSet = new Set();
    primaryArray.forEach((item) => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        Object.keys(item).forEach((k) => headerSet.add(k));
      } else {
        headerSet.add('value');
      }
    });

    const headers = Array.from(headerSet);
    const rows = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',')];

    primaryArray.forEach((item) => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const row = headers.map((h) => escapeCsvCell(item[h]));
        rows.push(row.join(','));
      } else {
        rows.push(escapeCsvCell(item));
      }
    });

    return rows.join('\n');
  }

  if (typeof data === 'object' && data !== null) {
    const rows = ['"Key","Value"'];
    Object.keys(data).forEach((key) => {
      rows.push(`${escapeCsvCell(key)},${escapeCsvCell(data[key])}`);
    });
    return rows.join('\n');
  }

  return escapeCsvCell(data);
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openToolsModal(options) {
  const { data, rawText = '', parseTimeMs = 0, onToast } = options;

  const backdrop = document.createElement('div');
  backdrop.className = 'pjv-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'pjv-modal pjv-tools-modal';

  const stats = analyzePayloadStats(rawText, data, parseTimeMs);
  let activeTab = 'ts';

  const renderContent = () => {
    modal.innerHTML = `
      <div class="pjv-tools-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">🛠️</span>
          <h3 style="margin:0; font-size:15px; color:var(--pjv-syntax-key);">Developer Tools Suite</h3>
        </div>
        <button id="pjv-tools-close" class="pjv-btn" style="padding:4px 8px;">✕</button>
      </div>

      <div class="pjv-tools-nav">
        <button class="pjv-tools-tab-btn ${activeTab === 'ts' ? 'active' : ''}" data-tab="ts">📘 TypeScript</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'zod' ? 'active' : ''}" data-tab="zod">📙 Zod Schema</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'yaml' ? 'active' : ''}" data-tab="yaml">📗 YAML</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'export' ? 'active' : ''}" data-tab="export">💾 Export</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'analytics' ? 'active' : ''}" data-tab="analytics">📊 Analytics</button>
      </div>

      <div id="pjv-tools-body" class="pjv-tools-body"></div>
    `;

    const bodyEl = modal.querySelector('#pjv-tools-body');
    const closeBtn = modal.querySelector('#pjv-tools-close');
    closeBtn.onclick = () => backdrop.remove();

    const tabBtns = modal.querySelectorAll('.pjv-tools-tab-btn');
    tabBtns.forEach((btn) => {
      btn.onclick = () => {
        activeTab = btn.dataset.tab;
        renderContent();
      };
    });

    if (activeTab === 'ts') {
      const tsCode = generateTypeScript(data, 'RootObject');
      bodyEl.innerHTML = `
        <div class="pjv-tools-panel">
          <div class="pjv-tools-toolbar">
            <span class="pjv-tools-hint">Auto-generated TypeScript interfaces with inferred types:</span>
            <div style="display:flex; gap:8px;">
              <button id="pjv-btn-copy-ts" class="pjv-btn active">📋 Copy TypeScript</button>
              <button id="pjv-btn-dl-ts" class="pjv-btn">📥 Download .d.ts</button>
            </div>
          </div>
          <textarea readonly class="pjv-code-preview">${escapeHtml(tsCode)}</textarea>
        </div>
      `;

      bodyEl.querySelector('#pjv-btn-copy-ts').onclick = () => {
        copyToClipboard(tsCode);
        if (onToast) onToast('Copied TypeScript interfaces to clipboard!');
      };

      bodyEl.querySelector('#pjv-btn-dl-ts').onclick = () => {
        downloadFile(`schema-${Date.now()}.d.ts`, tsCode, 'application/typescript');
        if (onToast) onToast('Downloaded TypeScript file!');
      };

    } else if (activeTab === 'zod') {
      const zodCode = generateZodSchema(data, 'rootSchema');
      bodyEl.innerHTML = `
        <div class="pjv-tools-panel">
          <div class="pjv-tools-toolbar">
            <span class="pjv-tools-hint">Auto-generated Zod validation schema code:</span>
            <div style="display:flex; gap:8px;">
              <button id="pjv-btn-copy-zod" class="pjv-btn active">📋 Copy Zod Schema</button>
              <button id="pjv-btn-dl-zod" class="pjv-btn">📥 Download .ts</button>
            </div>
          </div>
          <textarea readonly class="pjv-code-preview">${escapeHtml(zodCode)}</textarea>
        </div>
      `;

      bodyEl.querySelector('#pjv-btn-copy-zod').onclick = () => {
        copyToClipboard(zodCode);
        if (onToast) onToast('Copied Zod schema to clipboard!');
      };

      bodyEl.querySelector('#pjv-btn-dl-zod').onclick = () => {
        downloadFile(`zod-schema-${Date.now()}.ts`, zodCode, 'application/typescript');
        if (onToast) onToast('Downloaded Zod schema file!');
      };

    } else if (activeTab === 'yaml') {
      const yamlCode = jsonToYaml(data);
      bodyEl.innerHTML = `
        <div class="pjv-tools-panel">
          <div class="pjv-tools-toolbar">
            <span class="pjv-tools-hint">Converted clean YAML representation:</span>
            <div style="display:flex; gap:8px;">
              <button id="pjv-btn-copy-yaml" class="pjv-btn active">📋 Copy YAML</button>
              <button id="pjv-btn-dl-yaml" class="pjv-btn">📥 Download .yaml</button>
            </div>
          </div>
          <textarea readonly class="pjv-code-preview">${escapeHtml(yamlCode)}</textarea>
        </div>
      `;

      bodyEl.querySelector('#pjv-btn-copy-yaml').onclick = () => {
        copyToClipboard(yamlCode);
        if (onToast) onToast('Copied YAML to clipboard!');
      };

      bodyEl.querySelector('#pjv-btn-dl-yaml').onclick = () => {
        downloadFile(`payload-${Date.now()}.yaml`, yamlCode, 'text/yaml');
        if (onToast) onToast('Downloaded YAML file!');
      };

    } else if (activeTab === 'export') {
      bodyEl.innerHTML = `
        <div class="pjv-tools-panel" style="gap:16px;">
          <span class="pjv-tools-hint">Export payload into multiple developer-ready formats:</span>
          <div class="pjv-export-grid">
            <div class="pjv-export-card">
              <div class="pjv-export-title">📄 Formatted JSON</div>
              <div class="pjv-export-desc">Standard 2-space indented pretty-printed JSON file.</div>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <button id="pjv-dl-json-pretty" class="pjv-btn active">📥 Download .json</button>
                <button id="pjv-copy-json-pretty" class="pjv-btn">📋 Copy</button>
              </div>
            </div>

            <div class="pjv-export-card">
              <div class="pjv-export-title">⚡ Minified JSON</div>
              <div class="pjv-export-desc">Compact single-line JSON with whitespace stripped.</div>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <button id="pjv-dl-json-min" class="pjv-btn active">📥 Download .min.json</button>
                <button id="pjv-copy-json-min" class="pjv-btn">📋 Copy</button>
              </div>
            </div>

            <div class="pjv-export-card">
              <div class="pjv-export-title">📗 Clean YAML</div>
              <div class="pjv-export-desc">Clean human-readable YAML document for config/APIs.</div>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <button id="pjv-dl-yaml-exp" class="pjv-btn active">📥 Download .yaml</button>
                <button id="pjv-copy-yaml-exp" class="pjv-btn">📋 Copy</button>
              </div>
            </div>

            <div class="pjv-export-card">
              <div class="pjv-export-title">📊 CSV Spreadsheet</div>
              <div class="pjv-export-desc">RFC 4180 CSV spreadsheet table from primary array data.</div>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <button id="pjv-dl-csv-exp" class="pjv-btn active">📥 Download .csv</button>
                <button id="pjv-copy-csv-exp" class="pjv-btn">📋 Copy</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const prettyJson = JSON.stringify(data, null, 2);
      const minJson = JSON.stringify(data);
      const yamlStr = jsonToYaml(data);
      const csvStr = jsonToCsv(data);

      bodyEl.querySelector('#pjv-dl-json-pretty').onclick = () => {
        downloadFile(`payload-pretty-${Date.now()}.json`, prettyJson, 'application/json');
        if (onToast) onToast('Downloaded formatted JSON!');
      };
      bodyEl.querySelector('#pjv-copy-json-pretty').onclick = () => {
        copyToClipboard(prettyJson);
        if (onToast) onToast('Copied formatted JSON!');
      };

      bodyEl.querySelector('#pjv-dl-json-min').onclick = () => {
        downloadFile(`payload-min-${Date.now()}.json`, minJson, 'application/json');
        if (onToast) onToast('Downloaded minified JSON!');
      };
      bodyEl.querySelector('#pjv-copy-json-min').onclick = () => {
        copyToClipboard(minJson);
        if (onToast) onToast('Copied minified JSON!');
      };

      bodyEl.querySelector('#pjv-dl-yaml-exp').onclick = () => {
        downloadFile(`payload-${Date.now()}.yaml`, yamlStr, 'text/yaml');
        if (onToast) onToast('Downloaded YAML file!');
      };
      bodyEl.querySelector('#pjv-copy-yaml-exp').onclick = () => {
        copyToClipboard(yamlStr);
        if (onToast) onToast('Copied YAML!');
      };

      bodyEl.querySelector('#pjv-dl-csv-exp').onclick = () => {
        downloadFile(`payload-${Date.now()}.csv`, csvStr, 'text/csv');
        if (onToast) onToast('Downloaded CSV spreadsheet!');
      };
      bodyEl.querySelector('#pjv-copy-csv-exp').onclick = () => {
        copyToClipboard(csvStr);
        if (onToast) onToast('Copied CSV to clipboard!');
      };

    } else if (activeTab === 'analytics') {
      bodyEl.innerHTML = `
        <div class="pjv-tools-panel">
          <span class="pjv-tools-hint">Real-time analytical metrics for the current payload:</span>
          <div class="pjv-analytics-grid">
            <div class="pjv-analytics-card">
              <span class="analytics-label">📦 Payload Size</span>
              <span class="analytics-val">${stats.formattedSize}</span>
              <span class="analytics-sub">${stats.byteSize.toLocaleString()} bytes</span>
            </div>

            <div class="pjv-analytics-card">
              <span class="analytics-label">🔑 Total Keys</span>
              <span class="analytics-val">${stats.totalKeys.toLocaleString()}</span>
              <span class="analytics-sub">Across all objects</span>
            </div>

            <div class="pjv-analytics-card">
              <span class="analytics-label">📋 Array Count</span>
              <span class="analytics-val">${stats.arrayCount.toLocaleString()}</span>
              <span class="analytics-sub">Lists and collections</span>
            </div>

            <div class="pjv-analytics-card">
              <span class="analytics-label">📏 Max Nesting Depth</span>
              <span class="analytics-val">Level ${stats.maxDepth}</span>
              <span class="analytics-sub">Maximum hierarchy</span>
            </div>

            <div class="pjv-analytics-card">
              <span class="analytics-label">⚡ Deserialization Time</span>
              <span class="analytics-val">${stats.parseTimeMs} ms</span>
              <span class="analytics-sub">Engine benchmark</span>
            </div>
          </div>
        </div>
      `;
    }
  };

  renderContent();
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
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
  const startTime = performance.now();
  let jsonObject = parseJson(rawJsonText);
  const parseTimeMs = performance.now() - startTime;

  const payloadStats = analyzePayloadStats(rawJsonText, jsonObject, parseTimeMs);
  const statsSummary = `📦 ${payloadStats.formattedSize} • D${payloadStats.maxDepth} • ${payloadStats.totalKeys} keys`;

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

    const tableContainer = document.createElement('div');
    tableContainer.style.display = 'none';

    const chartContainer = document.createElement('div');
    chartContainer.style.display = 'none';

    const diagramContainer = document.createElement('div');
    diagramContainer.style.display = 'none';

    root.appendChild(toolbarContainer);
    root.appendChild(viewportContainer);
    root.appendChild(rawContainer);
    root.appendChild(tableContainer);
    root.appendChild(chartContainer);
    root.appendChild(diagramContainer);
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
    let tableView = null;

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
      currentTheme: settings.theme,
      statsSummary,
      onThemeChange: (newTheme) => {
        document.documentElement.setAttribute('data-theme', newTheme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : newTheme);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get('pro_json_settings').then((data) => {
            const updated = { ...DEFAULT_SETTINGS, ...data.pro_json_settings, theme: newTheme };
            chrome.storage.local.set({ pro_json_settings: updated });
          });
        }
      },
      onViewModeChange: (mode) => {
        viewportContainer.style.display = mode === 'tree' ? 'block' : 'none';
        rawContainer.style.display = mode === 'raw' ? 'block' : 'none';
        tableContainer.style.display = mode === 'table' ? 'block' : 'none';
        chartContainer.style.display = mode === 'chart' ? 'block' : 'none';
        diagramContainer.style.display = mode === 'diagram' ? 'block' : 'none';

        if (mode === 'table') {
          tableContainer.innerHTML = '';
          tableView = new TableView({
            container: tableContainer,
            data: jsonObject,
            scanDepth: settings.tableScanDepth || 3,
            onCopyToast: showToast
          });
        } else if (mode === 'chart') {
          chartContainer.innerHTML = '';
          new ChartView({
            container: chartContainer,
            data: jsonObject,
            scanDepth: settings.tableScanDepth || 3
          });
        } else if (mode === 'diagram') {
          diagramContainer.innerHTML = '';
          new DiagramView({
            container: diagramContainer,
            data: jsonObject,
            defaultDepth: settings.defaultExpandDepth || 2,
            onToast: showToast
          });
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
        copyToClipboard(JSON.stringify(jsonObject, null, 2));
        showToast('Copied JSON!');
      },
      onDownload: () => {
        downloadFile(`pro-json-${Date.now()}.json`, JSON.stringify(jsonObject, null, 2), 'application/json');
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
      onOpenTools: () => {
        openToolsModal({
          data: jsonObject,
          rawText: rawJsonText,
          parseTimeMs,
          onToast: showToast
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

// Real-time Storage Listener for Live Theme & Preference Updates
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.pro_json_settings) {
      const newSettings = changes.pro_json_settings.newValue;
      if (newSettings && newSettings.theme) {
        const theme = newSettings.theme;
        document.documentElement.setAttribute('data-theme', theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : theme);
      }
    }
  });
}
