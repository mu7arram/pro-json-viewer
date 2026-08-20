import { getSettings, saveSettings } from '../shared/storage';
import { copyToClipboard } from '../shared/utils';
import { buildFlatNodes } from '../engine/parser';
import { parseJsonAsync } from '../engine/worker-bridge';
import { ProgressLoader } from '../ui/progress-loader';
import { searchTree } from '../engine/jsonpath';
import { FilterMode, FlatNode, ViewMode } from '../shared/types';
import { TreeView } from '../ui/tree-view';
import { TableView } from '../ui/table-view';
import { ChartView } from '../ui/chart-view';
import { DiagramView } from '../ui/diagram-view';
import { Toolbar } from '../ui/toolbar';
import { openToolsModal } from '../ui/tools-modal';
import { openDiffModal } from '../ui/diff-view';
import { openShortcutsModal, registerKeyboardShortcuts } from '../ui/keyboard-shortcuts';
import '../ui/styles/theme.css';

async function initOptionsPage() {
  const isScratchpad = window.location.hash === '#scratchpad';
  const optionsView = document.getElementById('options-view')!;
  const scratchpadView = document.getElementById('scratchpad-view')!;

  if (isScratchpad) {
    optionsView.style.display = 'none';
    scratchpadView.style.display = 'block';
    await launchScratchpad(scratchpadView);
    return;
  }

  // Options settings binding
  const settings = await getSettings();

  const themeSelect = document.getElementById('opt-theme') as HTMLSelectElement;
  const depthSelect = document.getElementById('opt-depth') as HTMLSelectElement;
  const lineNoCheckbox = document.getElementById('opt-line-numbers') as HTMLInputElement;
  const jwtCheckbox = document.getElementById('opt-detect-jwt') as HTMLInputElement;
  const datesCheckbox = document.getElementById('opt-detect-dates') as HTMLInputElement;
  const schemaCheckbox = document.getElementById('opt-detect-schema') as HTMLInputElement;
  const saveBtn = document.getElementById('opt-save-btn') as HTMLButtonElement;
  const saveToast = document.getElementById('opt-save-toast') as HTMLElement;

  themeSelect.value = settings.theme;
  document.documentElement.setAttribute('data-theme', settings.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : settings.theme);

  depthSelect.value = String(settings.defaultExpandDepth);
  lineNoCheckbox.checked = settings.showLineNumbers;
  jwtCheckbox.checked = settings.detectJwt;
  datesCheckbox.checked = settings.detectDates;
  schemaCheckbox.checked = settings.detectSchemaHints;

  themeSelect.onchange = async () => {
    const newTheme = themeSelect.value as any;
    document.documentElement.setAttribute('data-theme', newTheme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : newTheme);
    await saveSettings({ theme: newTheme });
  };

  saveBtn.onclick = async () => {
    await saveSettings({
      theme: themeSelect.value as any,
      defaultExpandDepth: Number(depthSelect.value),
      showLineNumbers: lineNoCheckbox.checked,
      detectJwt: jwtCheckbox.checked,
      detectDates: datesCheckbox.checked,
      detectSchemaHints: schemaCheckbox.checked
    });

    saveToast.style.display = 'inline';
    setTimeout(() => (saveToast.style.display = 'none'), 2000);
  };
}

async function launchScratchpad(container: HTMLElement) {
  let sampleJsonStr = `{\n  "status": "success",\n  "code": 200,\n  "data": {\n    "user": {\n      "id": 1024,\n      "name": "Jane Doe",\n      "email": "jane.doe@example.com",\n      "created_at": "2026-08-08T21:00:00Z",\n      "timestamp": 1770000000,\n      "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"\n    },\n    "items": [\n      { "id": 1, "title": "Widget A", "price": 29.99 },\n      { "id": 2, "title": "Widget B", "price": 49.99 }\n    ]\n  }\n}`;

  // Check if context menu saved a scratchpad JSON snippet
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const { pjv_scratchpad_json } = await chrome.storage.local.get('pjv_scratchpad_json');
    if (pjv_scratchpad_json) {
      sampleJsonStr = pjv_scratchpad_json;
    }
  }

  const settings = await getSettings();

  document.documentElement.setAttribute('data-theme', settings.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : settings.theme);

  let loader: ProgressLoader | null = null;
  if (sampleJsonStr.length > 1.5 * 1024 * 1024) {
    loader = new ProgressLoader(document.body, sampleJsonStr.length);
  }

  let expandedStateMap = new Map<string, boolean>();
  let parseResult;
  try {
    parseResult = await parseJsonAsync(
      sampleJsonStr,
      settings.defaultExpandDepth,
      expandedStateMap,
      (progress) => {
        if (loader) loader.update(progress);
      }
    );
  } catch (err) {
    if (loader) loader.remove();
    console.error('Scratchpad parse error:', err);
    return;
  }

  if (loader) loader.remove();

  const jsonObject = parseResult.jsonObject;
  let currentNodes: FlatNode[] = parseResult.flatNodes;
  const parseTimeMs = parseResult.parseTimeMs || 0;
  const statsSummary = `📦 ${parseResult.formattedSize} • D${parseResult.maxDepth} • ${parseResult.totalKeys} keys`;

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
  container.appendChild(root);

  // Toast
  const toastEl = document.createElement('div');
  toastEl.className = 'pjv-toast';
  document.body.appendChild(toastEl);
  const showToast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2000);
  };

  let activeQuery = '';
  let activeMode: FilterMode = 'text';

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

  const toolbar = new Toolbar({
    container: toolbarContainer,
    currentTheme: settings.theme,
    statsSummary,
    onThemeChange: async (newTheme) => {
      document.documentElement.setAttribute('data-theme', newTheme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : newTheme);
      await saveSettings({ theme: newTheme as any });
    },
    onViewModeChange: (mode: ViewMode) => {
      viewportContainer.style.display = mode === 'tree' ? 'block' : 'none';
      rawContainer.style.display = mode === 'raw' ? 'block' : 'none';
      tableContainer.style.display = mode === 'table' ? 'block' : 'none';
      chartContainer.style.display = mode === 'chart' ? 'block' : 'none';
      diagramContainer.style.display = mode === 'diagram' ? 'block' : 'none';

      if (mode === 'table') {
        tableContainer.innerHTML = '';
        new TableView({
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
          onToast: showToast
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
      showToast('Copied JSON payload!');
    },
    onDownload: () => {
      const blob = new Blob([JSON.stringify(jsonObject, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scratchpad-${Date.now()}.json`;
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
    onOpenTools: (initialTab) => {
      openToolsModal({
        data: jsonObject,
        rawText: sampleJsonStr,
        parseTimeMs,
        onToast: showToast,
        initialTab
      });
    },
    onOpenShortcuts: () => {
      openShortcutsModal();
    },
    onOpenOptions: () => {
      window.location.hash = '';
      window.location.reload();
    }
  });

  // Global Keyboard Shortcuts
  registerKeyboardShortcuts({
    onSwitchView: (mode) => {
      toolbar.setViewMode(mode);
    },
    onFocusSearch: () => {
      toolbar.focusSearch();
    },
    onExpandAll: () => {
      expandedStateMap.clear();
      currentNodes = buildFlatNodes(jsonObject, 100, expandedStateMap);
      applyRender();
      showToast('Expanded All');
    },
    onCollapseAll: () => {
      expandedStateMap.clear();
      currentNodes = buildFlatNodes(jsonObject, 0, expandedStateMap);
      applyRender();
      showToast('Collapsed All');
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
    onOpenTools: () => {
      openToolsModal({
        data: jsonObject,
        rawText: sampleJsonStr,
        parseTimeMs,
        onToast: showToast,
        initialTab: 'ts'
      });
    }
  });

  applyRender();
}

document.addEventListener('DOMContentLoaded', initOptionsPage);
