import { buildFlatNodes, parseJson } from '../engine/parser';
import { searchTree } from '../engine/jsonpath';
import { FilterMode, FlatNode, UserSettings, ViewMode } from '../shared/types';
import { getSettings } from '../shared/storage';
import { TreeView } from '../ui/tree-view';
import { Toolbar } from '../ui/toolbar';
import { openDiffModal } from '../ui/diff-view';
import '../ui/styles/theme.css';

async function initProJsonViewer() {
  // Prevent double injection
  if (document.body && document.body.classList.contains('pjv-injected')) return;

  const rawText = extractRawJsonText();
  if (!rawText) return;

  let jsonObject: any;
  try {
    jsonObject = parseJson(rawText);
  } catch {
    // Not valid JSON
    return;
  }

  const settings = await getSettings();
  if (!settings.autoActivateOnJson) return;

  // Mark body injected
  document.body.classList.add('pjv-injected');
  document.documentElement.setAttribute('data-theme', settings.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : settings.theme);

  // Preserve raw content for raw mode toggle
  const rawContainer = document.createElement('textarea');
  rawContainer.className = 'pjv-raw-textarea';
  rawContainer.value = JSON.stringify(jsonObject, null, 2);
  rawContainer.style.display = 'none';

  // Build app mount
  const root = document.createElement('div');
  root.className = 'pjv-root';

  const toolbarContainer = document.createElement('div');
  const viewportContainer = document.createElement('div');
  viewportContainer.className = 'pjv-viewport';

  root.appendChild(toolbarContainer);
  root.appendChild(viewportContainer);
  root.appendChild(rawContainer);

  // Clear existing document and mount Pro JSON Viewer
  document.body.innerHTML = '';
  document.body.appendChild(root);

  // Toast notifications manager
  const toastEl = document.createElement('div');
  toastEl.className = 'pjv-toast';
  document.body.appendChild(toastEl);

  const showToast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2000);
  };

  // State management
  let expandedStateMap = new Map<string, boolean>();
  let currentNodes: FlatNode[] = buildFlatNodes(jsonObject, settings.defaultExpandDepth, expandedStateMap);
  let activeSearchQuery = '';
  let activeSearchMode: FilterMode = 'text';

  const treeView = new TreeView({
    container: viewportContainer,
    settings,
    onToggleExpand: (nodeId) => {
      const node = currentNodes.find((n) => n.id === nodeId);
      if (node) {
        const nextState = !node.isExpanded;
        expandedStateMap.set(nodeId, nextState);
        currentNodes = buildFlatNodes(jsonObject, settings.defaultExpandDepth, expandedStateMap);
        applySearchAndRender();
      }
    },
    onCopyToast: showToast
  });

  const applySearchAndRender = () => {
    const { matchedIds, expandAncestorIds } = searchTree(
      currentNodes,
      activeSearchQuery,
      activeSearchMode
    );

    // Expand ancestor chains for matches
    if (activeSearchQuery.trim()) {
      expandAncestorIds.forEach((id) => expandedStateMap.set(id, true));
      currentNodes = buildFlatNodes(jsonObject, settings.defaultExpandDepth, expandedStateMap);
    }

    treeView.setNodes(currentNodes, matchedIds);
  };

  new Toolbar({
    container: toolbarContainer,
    onViewModeChange: (mode: ViewMode) => {
      if (mode === 'raw') {
        viewportContainer.style.display = 'none';
        rawContainer.style.display = 'block';
      } else {
        rawContainer.style.display = 'none';
        viewportContainer.style.display = 'block';
      }
    },
    onSearchChange: (query, mode) => {
      activeSearchQuery = query;
      activeSearchMode = mode;
      applySearchAndRender();
    },
    onExpandDepth: (depth) => {
      expandedStateMap.clear();
      currentNodes = buildFlatNodes(jsonObject, depth, expandedStateMap);
      applySearchAndRender();
    },
    onCollapseAll: () => {
      expandedStateMap.clear();
      currentNodes = buildFlatNodes(jsonObject, 0, expandedStateMap);
      applySearchAndRender();
    },
    onExpandAll: () => {
      expandedStateMap.clear();
      currentNodes = buildFlatNodes(jsonObject, 100, expandedStateMap);
      applySearchAndRender();
    },
    onCopyAll: () => {
      navigator.clipboard.writeText(JSON.stringify(jsonObject, null, 2));
      showToast('Copied full JSON payload!');
    },
    onDownload: () => {
      const blob = new Blob([JSON.stringify(jsonObject, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `response-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded JSON file!');
    },
    onOpenDiff: () => {
      openDiffModal({
        primaryData: jsonObject,
        onDiffReady: (diffNodes, stats) => {
          currentNodes = diffNodes;
          treeView.setNodes(diffNodes);
          showToast(`Diff Applied: +${stats.added} -${stats.removed} ~${stats.modified}`);
        }
      });
    },
    onOpenOptions: () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        alert('Pro JSON Viewer settings persist automatically in chrome.storage!');
      }
    }
  });

  // Initial render
  applySearchAndRender();
}

function extractRawJsonText(): string | null {
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

  // Fallback check if body starts and ends with valid JSON braces
  const bodyText = document.body.innerText.trim();
  if ((bodyText.startsWith('{') && bodyText.endsWith('}')) || (bodyText.startsWith('[') && bodyText.endsWith(']'))) {
    if (bodyText.length < 5000000) { // Limit heuristic auto-detection size to 5MB
      try {
        JSON.parse(bodyText);
        return bodyText;
      } catch {
        // Not JSON
      }
    }
  }

  return null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProJsonViewer);
} else {
  initProJsonViewer();
}
