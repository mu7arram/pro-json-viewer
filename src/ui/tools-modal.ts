import { generateTypeScript, generateZodSchema, analyzePayloadStats } from '../engine/schema-generator';
import { jsonToYaml, jsonToCsv, downloadFile } from '../engine/export-engine';
import { copyToClipboard } from '../shared/utils';

export interface ToolsModalOptions {
  data: any;
  rawText?: string;
  parseTimeMs?: number;
  onToast?: (msg: string) => void;
}

export function openToolsModal(options: ToolsModalOptions) {
  const { data, rawText = '', parseTimeMs = 0, onToast } = options;

  const backdrop = document.createElement('div');
  backdrop.className = 'pjv-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'pjv-modal pjv-tools-modal';

  const stats = analyzePayloadStats(rawText, data, parseTimeMs);
  let activeTab: 'ts' | 'zod' | 'yaml' | 'export' | 'analytics' = 'ts';

  const renderContent = () => {
    modal.innerHTML = `
      <div class="pjv-tools-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">🛠️</span>
          <h3 style="margin:0; font-size:15px; color:var(--pjv-syntax-key);">Developer Tools Suite</h3>
        </div>
        <button id="pjv-tools-close" class="pjv-btn" style="padding:4px 8px;">✕</button>
      </div>

      <!-- Navigation Tabs -->
      <div class="pjv-tools-nav">
        <button class="pjv-tools-tab-btn ${activeTab === 'ts' ? 'active' : ''}" data-tab="ts">📘 TypeScript</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'zod' ? 'active' : ''}" data-tab="zod">📙 Zod Schema</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'yaml' ? 'active' : ''}" data-tab="yaml">📗 YAML</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'export' ? 'active' : ''}" data-tab="export">💾 Export</button>
        <button class="pjv-tools-tab-btn ${activeTab === 'analytics' ? 'active' : ''}" data-tab="analytics">📊 Analytics</button>
      </div>

      <div id="pjv-tools-body" class="pjv-tools-body"></div>
    `;

    const bodyEl = modal.querySelector('#pjv-tools-body') as HTMLElement;
    const closeBtn = modal.querySelector('#pjv-tools-close') as HTMLButtonElement;
    closeBtn.onclick = () => backdrop.remove();

    // Tab bindings
    const tabBtns = modal.querySelectorAll('.pjv-tools-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = (btn as HTMLElement).dataset.tab as any;
        renderContent();
      });
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

      bodyEl.querySelector('#pjv-btn-copy-ts')!.addEventListener('click', () => {
        copyToClipboard(tsCode);
        if (onToast) onToast('Copied TypeScript interfaces to clipboard!');
      });

      bodyEl.querySelector('#pjv-btn-dl-ts')!.addEventListener('click', () => {
        downloadFile(`schema-${Date.now()}.d.ts`, tsCode, 'application/typescript');
        if (onToast) onToast('Downloaded TypeScript file!');
      });

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

      bodyEl.querySelector('#pjv-btn-copy-zod')!.addEventListener('click', () => {
        copyToClipboard(zodCode);
        if (onToast) onToast('Copied Zod schema to clipboard!');
      });

      bodyEl.querySelector('#pjv-btn-dl-zod')!.addEventListener('click', () => {
        downloadFile(`zod-schema-${Date.now()}.ts`, zodCode, 'application/typescript');
        if (onToast) onToast('Downloaded Zod schema file!');
      });

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

      bodyEl.querySelector('#pjv-btn-copy-yaml')!.addEventListener('click', () => {
        copyToClipboard(yamlCode);
        if (onToast) onToast('Copied YAML to clipboard!');
      });

      bodyEl.querySelector('#pjv-btn-dl-yaml')!.addEventListener('click', () => {
        downloadFile(`payload-${Date.now()}.yaml`, yamlCode, 'text/yaml');
        if (onToast) onToast('Downloaded YAML file!');
      });

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

      bodyEl.querySelector('#pjv-dl-json-pretty')!.addEventListener('click', () => {
        downloadFile(`payload-pretty-${Date.now()}.json`, prettyJson, 'application/json');
        if (onToast) onToast('Downloaded formatted JSON!');
      });
      bodyEl.querySelector('#pjv-copy-json-pretty')!.addEventListener('click', () => {
        copyToClipboard(prettyJson);
        if (onToast) onToast('Copied formatted JSON!');
      });

      bodyEl.querySelector('#pjv-dl-json-min')!.addEventListener('click', () => {
        downloadFile(`payload-min-${Date.now()}.json`, minJson, 'application/json');
        if (onToast) onToast('Downloaded minified JSON!');
      });
      bodyEl.querySelector('#pjv-copy-json-min')!.addEventListener('click', () => {
        copyToClipboard(minJson);
        if (onToast) onToast('Copied minified JSON!');
      });

      bodyEl.querySelector('#pjv-dl-yaml-exp')!.addEventListener('click', () => {
        downloadFile(`payload-${Date.now()}.yaml`, yamlStr, 'text/yaml');
        if (onToast) onToast('Downloaded YAML file!');
      });
      bodyEl.querySelector('#pjv-copy-yaml-exp')!.addEventListener('click', () => {
        copyToClipboard(yamlStr);
        if (onToast) onToast('Copied YAML!');
      });

      bodyEl.querySelector('#pjv-dl-csv-exp')!.addEventListener('click', () => {
        downloadFile(`payload-${Date.now()}.csv`, csvStr, 'text/csv');
        if (onToast) onToast('Downloaded CSV spreadsheet!');
      });
      bodyEl.querySelector('#pjv-copy-csv-exp')!.addEventListener('click', () => {
        copyToClipboard(csvStr);
        if (onToast) onToast('Copied CSV to clipboard!');
      });

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
