export interface PayloadStats {
  byteSize: number;
  formattedSize: string;
  totalKeys: number;
  arrayCount: number;
  maxDepth: number;
  parseTimeMs?: number;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function analyzePayloadStats(rawText: string, data: any, parseTimeMs = 0): PayloadStats {
  const byteSize = new Blob([rawText || JSON.stringify(data)]).size;
  let totalKeys = 0;
  let arrayCount = 0;
  let maxDepth = 0;

  function traverse(obj: any, depth = 1) {
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

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[^a-zA-Z]+/, '')
    .replace(/^[a-z]/, (c) => c.toUpperCase()) || 'Item';
}

function sanitizeIdentifier(str: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str)) {
    return str;
  }
  return JSON.stringify(str);
}

/**
 * Generates TypeScript interfaces from JSON data.
 */
export function generateTypeScript(data: any, rootName = 'RootObject'): string {
  if (data === null || data === undefined) return `export type ${rootName} = null;`;
  if (typeof data !== 'object') return `export type ${rootName} = ${typeof data};`;

  const interfaces: Map<string, string> = new Map();

  function getTypeName(key: string): string {
    let name = toPascalCase(key);
    if (!name) name = 'NestedObject';
    return name;
  }

  function inferType(val: any, propertyKey = 'item'): string {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';

    const type = typeof val;
    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';

    if (Array.isArray(val)) {
      if (val.length === 0) return 'any[]';
      // Merge all element types
      const elemTypes = new Set<string>();
      val.forEach((elem) => elemTypes.add(inferType(elem, propertyKey)));
      const combined = Array.from(elemTypes).join(' | ');
      return elemTypes.size > 1 ? `(${combined})[]` : `${combined}[]`;
    }

    // It's an object
    const interfaceName = getTypeName(propertyKey);
    buildInterface(val, interfaceName);
    return interfaceName;
  }

  function buildInterface(obj: Record<string, any>, name: string) {
    if (interfaces.has(name)) return;
    interfaces.set(name, ''); // Mark as visited to prevent recursion loops

    const lines: string[] = [];
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
    const output: string[] = [];
    interfaces.forEach((code) => output.push(code));
    output.push(`export type ${rootName} = ${itemType}[];`);
    return output.join('\n\n');
  }

  buildInterface(data, rootName);
  const result: string[] = [];
  interfaces.forEach((code) => result.push(code));
  return result.join('\n\n');
}

/**
 * Generates Zod validation schemas from JSON data.
 */
export function generateZodSchema(data: any, rootName = 'rootSchema'): string {
  if (data === null || data === undefined) return `import { z } from 'zod';\n\nexport const ${rootName} = z.null();`;
  if (typeof data !== 'object') return `import { z } from 'zod';\n\nexport const ${rootName} = z.${typeof data}();`;

  const schemas: Map<string, string> = new Map();

  function getSchemaName(key: string): string {
    const pascal = toPascalCase(key);
    return `${pascal.charAt(0).toLowerCase() + pascal.slice(1)}Schema`;
  }

  function inferZod(val: any, propertyKey = 'item'): string {
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

  function buildZodObject(obj: Record<string, any>, name: string) {
    if (schemas.has(name)) return;
    schemas.set(name, '');

    const lines: string[] = [];
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
    const output: string[] = ["import { z } from 'zod';\n"];
    schemas.forEach((code) => output.push(code));
    output.push(`export const ${rootName} = z.array(${itemSchema});`);
    return output.join('\n\n');
  }

  buildZodObject(data, rootName);
  const result: string[] = ["import { z } from 'zod';\n"];
  schemas.forEach((code) => result.push(code));
  return result.join('\n\n');
}
