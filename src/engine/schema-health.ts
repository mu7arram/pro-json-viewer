export interface FieldHealthMetric {
  name: string;
  presenceCount: number;
  presenceRate: number; // 0 - 100%
  nullCount: number;
  nullRate: number; // 0 - 100%
  emptyCount: number;
  typesObserved: { type: string; count: number; percentage: number }[];
  primaryType: string;
  isTypeInconsistent: boolean;
  isMissingRequired: boolean;
  status: 'healthy' | 'warning' | 'anomaly';
  issues: string[];
}

export interface AnomalyDetail {
  rowIndex: number;
  rowIdentifier?: string;
  field: string;
  issueType: 'missing_field' | 'type_inconsistency' | 'null_value' | 'empty_value';
  description: string;
  observedValue?: any;
}

export interface CollectionHealthReport {
  collectionPath: string;
  collectionName: string;
  totalRecords: number;
  healthScore: number; // 0 - 100%
  fields: FieldHealthMetric[];
  anomalies: AnomalyDetail[];
  summary: {
    totalFields: number;
    healthyFields: number;
    inconsistentFields: number;
    missingFields: number;
    avgNullRate: number;
  };
}

export interface PayloadHealthReport {
  overallHealthScore: number; // 0 - 100%
  status: 'excellent' | 'good' | 'warning' | 'critical';
  totalCollectionsAudited: number;
  totalAnomaliesCount: number;
  collections: CollectionHealthReport[];
}

function getSpecificType(val: any): string {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  const t = typeof val;
  if (t === 'object') return 'object';
  if (t === 'number') return Number.isInteger(val) ? 'integer' : 'float';
  if (t === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(val)) return 'date-string';
    if (/^https?:\/\//.test(val)) return 'url-string';
    return 'string';
  }
  return t;
}

/**
 * Traverses JSON and finds all array collections of objects.
 */
export function findArrayCollections(data: any, path = '$', maxCollections = 20): { path: string; name: string; array: any[] }[] {
  const collections: { path: string; name: string; array: any[] }[] = [];

  function traverse(node: any, currentPath: string) {
    if (collections.length >= maxCollections) return;
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      if (node.length > 0 && typeof node[0] === 'object' && node[0] !== null) {
        const segs = currentPath.split('.');
        const name = segs[segs.length - 1] || 'Root Items';
        collections.push({ path: currentPath, name, array: node });
      }
      for (let i = 0; i < Math.min(node.length, 50); i++) {
        traverse(node[i], `${currentPath}[${i}]`);
      }
    } else {
      const keys = Object.keys(node);
      for (const k of keys) {
        traverse(node[k], currentPath === '$' ? `$.${k}` : `${currentPath}.${k}`);
      }
    }
  }

  traverse(data, path);

  // If root itself was an array of objects
  if (Array.isArray(data) && collections.length === 0 && data.length > 0) {
    collections.push({ path: '$', name: 'Root Array', array: data });
  }

  return collections;
}

/**
 * Analyzes a single array collection for schema health and anomalies.
 */
export function auditCollectionHealth(collection: { path: string; name: string; array: any[] }): CollectionHealthReport {
  const items = collection.array.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const totalRecords = items.length;

  if (totalRecords === 0) {
    return {
      collectionPath: collection.path,
      collectionName: collection.name,
      totalRecords: 0,
      healthScore: 100,
      fields: [],
      anomalies: [],
      summary: {
        totalFields: 0,
        healthyFields: 0,
        inconsistentFields: 0,
        missingFields: 0,
        avgNullRate: 0
      }
    };
  }

  // 1. Gather all unique field names
  const fieldKeyFrequency: Record<string, number> = {};
  const fieldNullFrequency: Record<string, number> = {};
  const fieldEmptyFrequency: Record<string, number> = {};
  const fieldTypeFrequency: Record<string, Record<string, number>> = {};

  items.forEach((row) => {
    const keysInRow = Object.keys(row);
    keysInRow.forEach((key) => {
      fieldKeyFrequency[key] = (fieldKeyFrequency[key] || 0) + 1;
      const val = row[key];

      if (val === null || val === undefined) {
        fieldNullFrequency[key] = (fieldNullFrequency[key] || 0) + 1;
      } else if (val === '') {
        fieldEmptyFrequency[key] = (fieldEmptyFrequency[key] || 0) + 1;
      }

      const specificType = getSpecificType(val);
      if (!fieldTypeFrequency[key]) fieldTypeFrequency[key] = {};
      fieldTypeFrequency[key][specificType] = (fieldTypeFrequency[key][specificType] || 0) + 1;
    });
  });

  const allFieldNames = Object.keys(fieldKeyFrequency).sort();
  const fieldsMetrics: FieldHealthMetric[] = [];
  const anomalies: AnomalyDetail[] = [];

  let inconsistentFieldsCount = 0;
  let missingFieldsCount = 0;
  let totalNullRatesSum = 0;

  // 2. Audit each field
  allFieldNames.forEach((fieldName) => {
    const presentCount = fieldKeyFrequency[fieldName] || 0;
    const presenceRate = Math.round((presentCount / totalRecords) * 100);
    const nullCount = fieldNullFrequency[fieldName] || 0;
    const nullRate = Math.round((nullCount / totalRecords) * 100);
    const emptyCount = fieldEmptyFrequency[fieldName] || 0;
    totalNullRatesSum += nullRate;

    const typeMap = fieldTypeFrequency[fieldName] || {};
    const typesObserved = Object.keys(typeMap).map((t) => ({
      type: t,
      count: typeMap[t],
      percentage: Math.round((typeMap[t] / presentCount) * 100)
    })).sort((a, b) => b.count - a.count);

    const primaryType = typesObserved[0]?.type || 'unknown';

    // Type inconsistency check (excluding null vs non-null)
    const nonNullTypes = typesObserved.filter((t) => t.type !== 'null');
    const isTypeInconsistent = nonNullTypes.length > 1;

    // Missing field check (appears in >= 50% but < 100% of rows)
    const isMissingRequired = presenceRate < 100 && presenceRate >= 50;

    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'anomaly' = 'healthy';

    if (isTypeInconsistent) {
      status = 'anomaly';
      inconsistentFieldsCount++;
      const typeSummary = nonNullTypes.map((t) => `${t.type} (${t.percentage}%)`).join(' vs ');
      issues.push(`Polymorphic type drift: ${typeSummary}`);
    }

    if (presenceRate < 100) {
      const missingCount = totalRecords - presentCount;
      if (isMissingRequired) {
        status = status === 'anomaly' ? 'anomaly' : 'warning';
        missingFieldsCount++;
        issues.push(`Missing in ${missingCount} records (${100 - presenceRate}% omitted)`);
      } else {
        issues.push(`Sparse / optional property (${presentCount}/${totalRecords} records)`);
      }
    }

    if (nullRate >= 30) {
      issues.push(`High null-rate: ${nullRate}% of rows are null`);
      if (status === 'healthy') status = 'warning';
    }

    fieldsMetrics.push({
      name: fieldName,
      presenceCount: presentCount,
      presenceRate,
      nullCount,
      nullRate,
      emptyCount,
      typesObserved,
      primaryType,
      isTypeInconsistent,
      isMissingRequired,
      status,
      issues
    });

    // Collect individual record anomalies
    if (isTypeInconsistent || isMissingRequired) {
      items.forEach((row, idx) => {
        const rowId = row.id || row._id || row.name || row.uuid || `#${idx + 1}`;
        if (!(fieldName in row)) {
          if (isMissingRequired) {
            anomalies.push({
              rowIndex: idx,
              rowIdentifier: String(rowId),
              field: fieldName,
              issueType: 'missing_field',
              description: `Missing field "${fieldName}" (expected in dominant schema)`
            });
          }
        } else {
          const val = row[fieldName];
          const valType = getSpecificType(val);
          if (valType !== 'null' && valType !== nonNullTypes[0]?.type) {
            anomalies.push({
              rowIndex: idx,
              rowIdentifier: String(rowId),
              field: fieldName,
              issueType: 'type_inconsistency',
              description: `Type mismatch on "${fieldName}": got ${valType}, expected ${nonNullTypes[0]?.type}`,
              observedValue: val
            });
          }
        }
      });
    }
  });

  // 3. Compute weighted health score (0 - 100%)
  const totalFields = allFieldNames.length;
  let score = 100;

  if (totalFields > 0) {
    const inconsistencyPenalty = (inconsistentFieldsCount / totalFields) * 45;
    const missingPenalty = (missingFieldsCount / totalFields) * 35;
    const avgNull = totalNullRatesSum / totalFields;
    const nullPenalty = (avgNull / 100) * 20;

    score = Math.max(10, Math.min(100, Math.round(100 - inconsistencyPenalty - missingPenalty - nullPenalty)));
  }

  const healthyFieldsCount = fieldsMetrics.filter((f) => f.status === 'healthy').length;
  const avgNullRate = totalFields > 0 ? Math.round(totalNullRatesSum / totalFields) : 0;

  return {
    collectionPath: collection.path,
    collectionName: collection.name,
    totalRecords,
    healthScore: score,
    fields: fieldsMetrics,
    anomalies: anomalies.slice(0, 100), // Cap at 100 details
    summary: {
      totalFields,
      healthyFields: healthyFieldsCount,
      inconsistentFields: inconsistentFieldsCount,
      missingFields: missingFieldsCount,
      avgNullRate
    }
  };
}

/**
 * Audits full JSON payload schema health across all discoverable collections.
 */
export function analyzePayloadSchemaHealth(data: any): PayloadHealthReport {
  const collections = findArrayCollections(data);

  if (collections.length === 0) {
    // If no arrays found, audit root object if applicable
    if (data && typeof data === 'object') {
      const singleItemCollection = [{ path: '$', name: 'Root Object', array: [data] }];
      const report = auditCollectionHealth(singleItemCollection[0]);
      return {
        overallHealthScore: 100,
        status: 'excellent',
        totalCollectionsAudited: 1,
        totalAnomaliesCount: 0,
        collections: [report]
      };
    }

    return {
      overallHealthScore: 100,
      status: 'excellent',
      totalCollectionsAudited: 0,
      totalAnomaliesCount: 0,
      collections: []
    };
  }

  const collectionReports = collections.map(auditCollectionHealth);
  const totalAnomalies = collectionReports.reduce((sum, c) => sum + c.anomalies.length, 0);

  const avgScore = Math.round(
    collectionReports.reduce((sum, c) => sum + c.healthScore, 0) / collectionReports.length
  );

  let status: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';
  if (avgScore < 60) status = 'critical';
  else if (avgScore < 80) status = 'warning';
  else if (avgScore < 95) status = 'good';

  return {
    overallHealthScore: avgScore,
    status,
    totalCollectionsAudited: collectionReports.length,
    totalAnomaliesCount: totalAnomalies,
    collections: collectionReports
  };
}

/**
 * Generates a clean GitHub/Jira markdown audit summary report.
 */
export function generateSchemaHealthMarkdown(report: PayloadHealthReport): string {
  let md = `# 🩺 Pro JSON Viewer — Schema Health & Anomaly Audit Report\n\n`;
  md += `**Overall Health Score**: **${report.overallHealthScore}%** (${report.status.toUpperCase()})\n`;
  md += `**Collections Audited**: ${report.totalCollectionsAudited} | **Total Anomalies**: ${report.totalAnomaliesCount}\n\n`;
  md += `---\n\n`;

  report.collections.forEach((col) => {
    md += `## 📦 Collection: \`${col.collectionPath}\` (${col.collectionName})\n`;
    md += `- **Records**: ${col.totalRecords} rows\n`;
    md += `- **Health Score**: ${col.healthScore}%\n`;
    md += `- **Fields**: ${col.summary.totalFields} total (${col.summary.healthyFields} healthy, ${col.summary.inconsistentFields} type drift, ${col.summary.missingFields} missing)\n\n`;

    md += `| Field | Presence Rate | Null Rate | Observed Types | Status |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    col.fields.forEach((f) => {
      const typeStr = f.typesObserved.map((t) => `${t.type} (${t.percentage}%)`).join(', ');
      const statusIcon = f.status === 'healthy' ? '✅ Healthy' : f.status === 'warning' ? '⚠️ Warning' : '🚨 Anomaly';
      md += `| \`${f.name}\` | ${f.presenceRate}% (${f.presenceCount}/${col.totalRecords}) | ${f.nullRate}% | ${typeStr} | ${statusIcon} |\n`;
    });

    if (col.anomalies.length > 0) {
      md += `\n### 🚨 Detected Anomalies (${col.anomalies.length}):\n`;
      col.anomalies.slice(0, 15).forEach((anom, idx) => {
        md += `${idx + 1}. **Row [${anom.rowIndex}] (${anom.rowIdentifier || 'Record'})**: ${anom.description}\n`;
      });
      if (col.anomalies.length > 15) {
        md += `*...and ${col.anomalies.length - 15} more anomalies.*\n`;
      }
    }
    md += `\n---\n\n`;
  });

  md += `*Generated automatically with Pro JSON Viewer.*`;
  return md;
}
