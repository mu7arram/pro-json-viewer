/**
 * Zero-dependency JSON to YAML Serializer
 */
export function jsonToYaml(data: any, indentLevel = 0): string {
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

/**
 * Converts JSON objects or nested arrays into standard RFC 4180 CSV format.
 */
export function jsonToCsv(data: any): string {
  if (!data) return '';

  function findPrimaryArray(obj: any): any[] | null {
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

  function escapeCsvCell(val: any): string {
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
    const headerSet = new Set<string>();
    primaryArray.forEach((item) => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        Object.keys(item).forEach((k) => headerSet.add(k));
      } else {
        headerSet.add('value');
      }
    });

    const headers = Array.from(headerSet);
    const rows: string[] = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',')];

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
    const rows: string[] = ['"Key","Value"'];
    Object.keys(data).forEach((key) => {
      rows.push(`${escapeCsvCell(key)},${escapeCsvCell(data[key])}`);
    });
    return rows.join('\n');
  }

  return escapeCsvCell(data);
}

/**
 * Triggers a file download in the browser.
 */
export function downloadFile(filename: string, content: string, mimeType: string) {
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

