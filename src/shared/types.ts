export type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface PathSegment {
  key: string | number;
  type: 'property' | 'index';
}

export interface SmartDetection {
  type: 'date' | 'jwt' | 'url' | 'base64' | 'schema_anomaly';
  raw: string;
  formatted?: string;
  badge?: string;
  metadata?: Record<string, any>;
}

export interface FlatNode {
  id: string; // e.g. "root.users[0].name"
  depth: number;
  key: string | number | null; // null for root or un-keyed array items
  value: any; // Raw JSON value or child count summary
  type: NodeType;
  path: string; // JSONPath representation e.g. "$.users[0].name"
  pathSegments: PathSegment[];
  isExpanded: boolean;
  hasChildren: boolean;
  childCount: number;
  parentId: string | null;
  smart?: SmartDetection | null;
  diffStatus?: 'added' | 'removed' | 'modified' | 'unchanged';
  oldValue?: any;
}

export type ThemePreset =
  | 'system'
  | 'dark'
  | 'light'
  | 'dracula'
  | 'onedark'
  | 'monokai'
  | 'nord'
  | 'github-dark'
  | 'github-light';

export interface UserSettings {
  theme: ThemePreset;
  defaultExpandDepth: number; // 1 - 5
  fontSize: number; // 12 - 20 px
  indentSize: number; // 12 - 28 px per level
  showLineNumbers: boolean;
  virtualRowHeight: number; // default 26px
  detectDates: boolean;
  detectJwt: boolean;
  detectUrls: boolean;
  detectBase64: boolean;
  detectSchemaHints: boolean;
  autoActivateOnJson: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
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

export type ViewMode = 'tree' | 'raw' | 'diff';
export type FilterMode = 'text' | 'regex' | 'jsonpath';
