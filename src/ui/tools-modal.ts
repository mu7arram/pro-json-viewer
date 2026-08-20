import { generateTypeScript, generateZodSchema, analyzePayloadStats } from '../engine/schema-generator';
import { jsonToYaml, jsonToCsv, downloadFile } from '../engine/export-engine';
import { analyzePayloadSchemaHealth, generateSchemaHealthMarkdown } from '../engine/schema-health';
import { copyToClipboard } from '../shared/utils';

export interface ToolsModalOptions {
  data: any;
  rawText?: string;
  parseTimeMs?: number;
  onToast?: (msg: string) => void;
  initialTab?: 'ts' | 'zod' | 'yaml' | 'export' | 'analytics' | 'health';
}

export function openToolsModal(options: ToolsModalOptions) {
  const { data, rawText = '', parseTimeMs = 0, onToast, initialTab = 'ts' } = options;

  const backdrop = document.createElement('div');
  backdrop.className = 'pjv-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'pjv-modal pjv-tools-modal';

  const stats = analyzePayloadStats(rawText, data, parseTimeMs);
  let activeTab: 'ts' | 'zod' | 'yaml' | 'export' | 'analytics' | 'health' = initialTab;
  let activeCollectionIdx = 0;

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
        <button class="pjv-tools-tab-btn ${activeTab === 'health' ? 'active' : ''}" data-tab="health">🩺 Schema Health</button>
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
        downloadFile(`schema-${Date.now()}.ts`, zodCode, 'application/typescript');
        if (onToast) onToast('Downloaded Zod schema file!');
      });

    } else if (activeTab === 'yaml') {
      const yamlCode = jsonToYaml(data);
      bodyEl.innerHTML = `
        <div class="pjv-tools-panel">
          <div class="pjv-tools-toolbar">
            <span class="pjv-tools-hint">Clean formatted YAML conversion:</span>
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
      const yamlStr = jsonToYaml(data);
      const csvStr = jsonToCsv(data);
      const formattedJson = JSON.stringify(data, null, 2);
      const minifiedJson = JSON.stringify(data);

      bodyEl.innerHTML = `
        <div class="pjv-tools-panel">
          <span class="pjv-tools-hint">One-click exports and data format conversions:</span>
          <div class="pjv-export-grid">
            <div class="pjv-export-card">
              <div class="pjv-export-info">
                <h4>📄 Formatted JSON</h4>
                <p>Human-readable indented JSON payload</p>
              </div>
              <div class="pjv-btn-group">
                <button id="pjv-copy-fmt-json" class="pjv-btn">📋 Copy</button>
                <button id="pjv-dl-fmt-json" class="pjv-btn active">📥 Download</button>
              </div>
            </div>

            <div class="pjv-export-card">
              <div class="pjv-export-info">
                <h4>⚡ Minified JSON</h4>
                <p>Compact, single-line payload with zero whitespace</p>
              </div>
              <div class="pjv-btn-group">
                <button id="pjv-copy-min-json" class="pjv-btn">📋 Copy</button>
                <button id="pjv-dl-min-json" class="pjv-btn active">📥 Download</button>
              </div>
            </div>

            <div class="pjv-export-card">
              <div class="pjv-export-info">
                <h4>📗 YAML Document</h4>
                <p>Clean YAML representation of document structure</p>
              </div>
              <div class="pjv-btn-group">
                <button id="pjv-copy-yaml-exp" class="pjv-btn">📋 Copy</button>
                <button id="pjv-dl-yaml-exp" class="pjv-btn active">📥 Download</button>
              </div>
            </div>

            <div class="pjv-export-card">
              <div class="pjv-export-info">
                <h4>📊 RFC 4180 CSV</h4>
                <p>Spreadsheet export of primary array collections</p>
              </div>
              <div class="pjv-btn-group">
                <button id="pjv-copy-csv-exp" class="pjv-btn">📋 Copy</button>
                <button id="pjv-dl-csv-exp" class="pjv-btn active">📥 Download</button>
              </div>
            </div>
          </div>
        </div>
      `;

      bodyEl.querySelector('#pjv-dl-fmt-json')!.addEventListener('click', () => {
        downloadFile(`payload-formatted-${Date.now()}.json`, formattedJson, 'application/json');
        if (onToast) onToast('Downloaded formatted JSON!');
      });
      bodyEl.querySelector('#pjv-copy-fmt-json')!.addEventListener('click', () => {
        copyToClipboard(formattedJson);
        if (onToast) onToast('Copied JSON!');
      });

      bodyEl.querySelector('#pjv-dl-min-json')!.addEventListener('click', () => {
        downloadFile(`payload-minified-${Date.now()}.json`, minifiedJson, 'application/json');
        if (onToast) onToast('Downloaded minified JSON!');
      });
      bodyEl.querySelector('#pjv-copy-min-json')!.addEventListener('click', () => {
        copyToClipboard(minifiedJson);
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
    } else if (activeTab === 'health') {
      const healthReport = analyzePayloadSchemaHealth(data);
      const activeCol = healthReport.collections[activeCollectionIdx] || healthReport.collections[0];

      let collectionSelectorHtml = '';
      if (healthReport.collections.length > 1) {
        collectionSelectorHtml = `
          <div class="pjv-health-collections-nav">
            <span style="font-size:12px; color:var(--pjv-text-muted); font-weight:600;">Collections:</span>
            ${healthReport.collections.map((col, idx) => `
              <button class="pjv-btn ${idx === activeCollectionIdx ? 'active' : ''}" data-col-idx="${idx}">
                ${escapeHtml(col.collectionName)} (${col.totalRecords} rows)
              </button>
            `).join('')}
          </div>
        `;
      }

      let statusBadgeClass = 'pjv-health-badge-excellent';
      let statusIcon = '🟢';
      if (healthReport.status === 'good') { statusBadgeClass = 'pjv-health-badge-good'; statusIcon = '🟢'; }
      else if (healthReport.status === 'warning') { statusBadgeClass = 'pjv-health-badge-warning'; statusIcon = '🟡'; }
      else if (healthReport.status === 'critical') { statusBadgeClass = 'pjv-health-badge-critical'; statusIcon = '🔴'; }

      let tableRowsHtml = '';
      if (activeCol && activeCol.fields.length > 0) {
        tableRowsHtml = activeCol.fields.map((f) => {
          const typeBadges = f.typesObserved.map((t) =>
            `<span class="pjv-type-badge ${t.type !== f.primaryType ? 'inconsistent' : ''}">${t.type} (${t.percentage}%)</span>`
          ).join(' ');

          const statusBadge = f.status === 'healthy'
            ? `<span class="pjv-status-pill healthy">✅ Clean</span>`
            : f.status === 'warning'
            ? `<span class="pjv-status-pill warning">⚠️ Sparse</span>`
            : `<span class="pjv-status-pill anomaly">🚨 Type Drift</span>`;

          const presenceColor = f.presenceRate === 100 ? 'var(--pjv-accent, #22c55e)' : f.presenceRate >= 70 ? '#f59e0b' : '#ef4444';
          const nullColor = f.nullRate === 0 ? 'var(--pjv-text-muted)' : f.nullRate > 25 ? '#ef4444' : '#f59e0b';

          return `
            <tr>
              <td>
                <strong style="color:var(--pjv-syntax-key); font-family:var(--pjv-font-mono, monospace);">${escapeHtml(f.name)}</strong>
                ${f.issues.length > 0 ? `<div style="font-size:11px; color:var(--pjv-text-muted); margin-top:2px;">${escapeHtml(f.issues.join('; '))}</div>` : ''}
              </td>
              <td>
                <div class="pjv-health-bar-container">
                  <div class="pjv-health-bar-fill" style="width:${f.presenceRate}%; background:${presenceColor};"></div>
                </div>
                <span style="font-size:11px; font-family:var(--pjv-font-mono, monospace); color:${presenceColor}; font-weight:600;">${f.presenceRate}% (${f.presenceCount}/${activeCol.totalRecords})</span>
              </td>
              <td>
                <span style="font-size:11.5px; font-family:var(--pjv-font-mono, monospace); color:${nullColor}; font-weight:600;">${f.nullRate}%</span>
                <span style="font-size:10.5px; color:var(--pjv-text-muted);">(${f.nullCount} rows)</span>
              </td>
              <td>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${typeBadges}</div>
              </td>
              <td style="text-align:right;">${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }

      let anomaliesListHtml = '';
      if (activeCol && activeCol.anomalies.length > 0) {
        anomaliesListHtml = `
          <div class="pjv-health-anomalies-section">
            <h4 style="margin:12px 0 8px 0; font-size:13px; color:#f87171; display:flex; align-items:center; gap:6px;">
              <span>🚨</span> Detected Schema Anomalies (${activeCol.anomalies.length})
            </h4>
            <div class="pjv-anomalies-list">
              ${activeCol.anomalies.slice(0, 20).map((a) => `
                <div class="pjv-anomaly-item">
                  <span class="pjv-anomaly-row">Row [${a.rowIndex}] (${escapeHtml(a.rowIdentifier || 'Record')})</span>
                  <span class="pjv-anomaly-desc">${escapeHtml(a.description)}</span>
                  ${a.observedValue !== undefined ? `<code class="pjv-anomaly-val">${escapeHtml(JSON.stringify(a.observedValue))}</code>` : ''}
                </div>
              `).join('')}
              ${activeCol.anomalies.length > 20 ? `<div style="font-size:11px; color:var(--pjv-text-muted); padding:4px;">...and ${activeCol.anomalies.length - 20} more anomalies.</div>` : ''}
            </div>
          </div>
        `;
      }

      bodyEl.innerHTML = `
        <div class="pjv-tools-panel pjv-schema-health-panel">
          <!-- Top Health Summary Banner -->
          <div class="pjv-health-score-banner ${statusBadgeClass}">
            <div class="pjv-health-banner-left">
              <div class="pjv-health-score-dial">
                <span class="health-score-num">${healthReport.overallHealthScore}%</span>
                <span class="health-score-sub">Health Score</span>
              </div>
              <div class="pjv-health-banner-info">
                <h4 style="margin:0 0 4px 0; font-size:15px; color:var(--pjv-text-main); display:flex; align-items:center; gap:6px;">
                  <span>${statusIcon}</span> ${healthReport.status.toUpperCase()} — Schema Health
                </h4>
                <p style="margin:0; font-size:12px; color:var(--pjv-text-muted);">
                  Audited ${healthReport.totalCollectionsAudited} collection(s) across payload. Found ${healthReport.totalAnomaliesCount} schema anomaly occurrences.
                </p>
              </div>
            </div>
            <div class="pjv-health-banner-actions">
              <button id="pjv-btn-copy-health-report" class="pjv-btn active">📋 Copy Report</button>
              <button id="pjv-btn-dl-health-report" class="pjv-btn">📥 Download Summary</button>
            </div>
          </div>

          ${collectionSelectorHtml}

          <!-- Collection Details Card -->
          ${activeCol ? `
            <div class="pjv-health-summary-row">
              <div class="pjv-health-stat-chip">
                <span class="label">📦 Target Path</span>
                <span class="val">${escapeHtml(activeCol.collectionPath)}</span>
              </div>
              <div class="pjv-health-stat-chip">
                <span class="label">📋 Records</span>
                <span class="val">${activeCol.totalRecords} rows</span>
              </div>
              <div class="pjv-health-stat-chip">
                <span class="label">✅ Clean Fields</span>
                <span class="val">${activeCol.summary.healthyFields} / ${activeCol.summary.totalFields}</span>
              </div>
              <div class="pjv-health-stat-chip">
                <span class="label">🚨 Type Inconsistencies</span>
                <span class="val" style="color:${activeCol.summary.inconsistentFields > 0 ? '#ef4444' : 'inherit'};">${activeCol.summary.inconsistentFields}</span>
              </div>
              <div class="pjv-health-stat-chip">
                <span class="label">⚠️ Missing In Some Rows</span>
                <span class="val" style="color:${activeCol.summary.missingFields > 0 ? '#f59e0b' : 'inherit'};">${activeCol.summary.missingFields}</span>
              </div>
            </div>

            <!-- Field Audit Table -->
            <div class="pjv-health-table-wrapper">
              <table class="pjv-health-table">
                <thead>
                  <tr>
                    <th>Property Name</th>
                    <th>Presence Rate</th>
                    <th>Null Rate</th>
                    <th>Observed Types</th>
                    <th style="text-align:right;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>

            ${anomaliesListHtml}
          ` : `
            <div style="padding:24px; text-align:center; color:var(--pjv-text-muted);">
              No array collections found in current payload. Schema is single object structure.
            </div>
          `}
        </div>
      `;

      // Event listeners for collection switches and export
      bodyEl.querySelectorAll('.pjv-health-collections-nav button').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeCollectionIdx = Number((btn as HTMLElement).dataset.colIdx);
          renderContent();
        });
      });

      bodyEl.querySelector('#pjv-btn-copy-health-report')?.addEventListener('click', () => {
        const md = generateSchemaHealthMarkdown(healthReport);
        copyToClipboard(md);
        if (onToast) onToast('Copied Schema Health audit report to clipboard!');
      });

      bodyEl.querySelector('#pjv-btn-dl-health-report')?.addEventListener('click', () => {
        const md = generateSchemaHealthMarkdown(healthReport);
        downloadFile(`schema-health-audit-${Date.now()}.md`, md, 'text/markdown');
        if (onToast) onToast('Downloaded Schema Health report!');
      });
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
