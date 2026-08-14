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
        <button class="pjv-btn" id="pjv-btn-copy">Copy</button>
        <button class="pjv-btn" id="pjv-btn-download">Save</button>
        <button class="pjv-btn" id="pjv-btn-options">⚙️</button>
      </div>

      <div class="pjv-badge-local">
        <span>🔒</span> 100% Local
      </div>
    `;

    const treeBtn = this.container.querySelector('#pjv-btn-tree');
    const tableBtn = this.container.querySelector('#pjv-btn-table');
    const rawBtn = this.container.querySelector('#pjv-btn-raw');
    const diffBtn = this.container.querySelector('#pjv-btn-diff');

    const setView = (mode) => {
      this.currentMode = mode;
      [treeBtn, tableBtn, rawBtn, diffBtn].forEach((btn) => btn.classList.remove('active'));
      if (mode === 'tree') treeBtn.classList.add('active');
      if (mode === 'table') tableBtn.classList.add('active');
      if (mode === 'raw') rawBtn.classList.add('active');
      if (mode === 'diff') diffBtn.classList.add('active');
      opts.onViewModeChange(mode);
    };

    treeBtn.onclick = () => setView('tree');
    tableBtn.onclick = () => setView('table');
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
    this.scanDepth = options.scanDepth || 20;
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

    const tableContainer = document.createElement('div');
    tableContainer.style.display = 'none';

    root.appendChild(toolbarContainer);
    root.appendChild(viewportContainer);
    root.appendChild(rawContainer);
    root.appendChild(tableContainer);
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

        if (mode === 'table') {
          tableContainer.innerHTML = '';
          tableView = new TableView({
            container: tableContainer,
            data: jsonObject,
            scanDepth: settings.tableScanDepth || 20,
            onCopyToast: showToast
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
