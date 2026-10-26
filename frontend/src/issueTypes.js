export const TYPE_LABELS = {
  missing_value: 'Missing value',
  duplicate: 'Duplicate',
  outlier: 'Outlier',
  inconsistent_value: 'Inconsistent value',
  sparse_column: 'Sparse column',
  rare_category: 'Rare category',
  date_anomaly: 'Date anomaly',
  pattern_violation: 'Invalid format',
  range_violation: 'Out of range',
  temporal_anomaly: 'Temporal spike',
};

// Per-type colours carried over from the original EDAIC charts.
export const TYPE_COLORS = {
  missing_value: '#35d0b0',
  duplicate: '#7c7cf0',
  outlier: '#f1667a',
  inconsistent_value: '#f2b84b',
  sparse_column: '#5aa9e6',
  rare_category: '#c084fc',
  date_anomaly: '#fb923c',
  pattern_violation: '#e879a9',
  range_violation: '#f87171',
  temporal_anomaly: '#a3e635',
};
