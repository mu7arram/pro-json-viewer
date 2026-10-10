import { SmartDetection } from '../shared/types';

export function detectSmartValue(value: any): SmartDetection | null {
  if (value === null || value === undefined) return null;

  // 1. Number or numeric string timestamp detection
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value))) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!isNaN(num)) {
      // Milliseconds or Seconds check
      const ms = num < 10000000000 ? num * 1000 : num;
      // Valid timestamp check between years 2000 and 2100
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

  // 2. URL detection
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(str)) {
    return {
      type: 'url',
      raw: str,
      formatted: str,
      badge: 'LINK'
    };
  }

  // 3. ISO Date string detection
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

  // 4. JWT Detection (header.payload.signature)
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(str)) {
    try {
      const parts = str.split('.');
      const decodeBase64Url = (part: string) => {
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
    } catch {
      // Invalid JWT JSON content inside payload
    }
  }

  // 5. Plain Base64 detection
  if (str.length >= 16 && str.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(str)) {
    try {
      const decoded = atob(str);
      // Ensure decoded text is mostly printable ASCII / UTF-8
      if (/^[\x20-\x7E\s]+$/.test(decoded)) {
        // Try parsing decoded as nested JSON if applicable
        let parsed = null;
        try {
          parsed = JSON.parse(decoded);
        } catch {
          // Plain decoded text
        }

        return {
          type: 'base64',
          raw: str,
          formatted: parsed ? JSON.stringify(parsed, null, 2) : decoded,
          badge: 'BASE64',
          metadata: { decoded, parsed }
        };
      }
    } catch {
      // Ignore invalid base64
    }
  }

  return null;
}

export function detectSchemaAnomalies(array: any[]): Set<number> {
  const anomalousIndexes = new Set<number>();
  if (!Array.isArray(array) || array.length < 2) return anomalousIndexes;

  // Collect key frequency across all array objects
  const keyFrequency: Record<string, number> = {};
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

  // Keys that appear in >= 60% of objects are expected keys
  const threshold = Math.ceil(objectCount * 0.6);
  const expectedKeys = Object.keys(keyFrequency).filter((k) => keyFrequency[k] >= threshold);

  array.forEach((item, index) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = new Set(Object.keys(item));
      // If object is missing one of the expected core keys, flag as schema anomaly
      const isMissingCoreKey = expectedKeys.some((k) => !keys.has(k));
      if (isMissingCoreKey) {
        anomalousIndexes.add(index);
      }
    }
  });

  return anomalousIndexes;
}

export function extractRawJsonFromDocument(doc: Document = document, loc: Location = window.location): string | null {
  if (!doc || !doc.body) return null;

  const contentType = (doc.contentType || '').toLowerCase();
  const isJsonHeader = contentType.includes('json') || contentType.includes('+json');
  const isJsonFileExt = (loc.pathname || '').toLowerCase().endsWith('.json');

  // Case 1: Server explicitly sent JSON content-type header or URL is a .json file
  if (isJsonHeader || isJsonFileExt) {
    // 1a. Chrome Native JSON viewer or standard browser <pre> wrapper
    // In Chrome 117+, Chrome may render its own UI (div#json, pre, or extra injected elements).
    const preEl = doc.body.querySelector ? doc.body.querySelector('pre') : doc.querySelector?.('pre');
    const jsonDivEl = doc.body.querySelector ? doc.body.querySelector('div#json, div.jsonContainer') : doc.querySelector?.('div#json, div.jsonContainer');
    
    let candidateText = '';
    if (preEl && preEl.textContent) {
      candidateText = preEl.textContent.trim();
    } else if (jsonDivEl && jsonDivEl.textContent) {
      candidateText = jsonDivEl.textContent.trim();
    } else {
      candidateText = (doc.body.textContent || '').trim();
    }

    if (candidateText && (
      candidateText.startsWith('{') ||
      candidateText.startsWith('[') ||
      candidateText.startsWith('"') ||
      candidateText === 'null' ||
      candidateText === 'true' ||
      candidateText === 'false' ||
      !isNaN(Number(candidateText))
    )) {
      try {
        JSON.parse(candidateText);
        return candidateText;
      } catch {}
    }
    return null;
  }

  // Case 2: Document has no JSON header (e.g. text/plain or local file)
  // MUST strictly verify this is a raw browser document, NOT an HTML website.
  // HTML websites (e.g. jsonformatter.org, swagger, blogs) have multiple elements, scripts, forms, navs, headers, etc.
  const childCount = doc.body.children.length;
  const firstChild = doc.body.firstElementChild;
  const isSinglePre = childCount === 1 && firstChild?.tagName === 'PRE';
  const isDirectText = childCount === 0;

  if (isSinglePre || isDirectText) {
    // Ensure there are no other HTML structure elements in body or head
    const hasHtmlStructure = doc.querySelector('nav, header, footer, main, form, input, button, select, iframe, script:not([src*="extension"])');
    if (!hasHtmlStructure) {
      const text = (doc.body.textContent || '').trim();
      if (text && (text.startsWith('{') || text.startsWith('['))) {
        try {
          JSON.parse(text);
          return text;
        } catch {}
      }
    }
  }

  return null;
}
