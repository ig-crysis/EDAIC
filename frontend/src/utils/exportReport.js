/**
 * Builds and downloads a standalone audit report (CSV) listing every
 * detected issue, its explanation, and the reviewer's decision. This is
 * intentionally separate from the cleaned dataset download — it's a
 * record of *what was found and why*, useful for demonstrating the
 * explainability/audit-trail side of the pipeline independent of the
 * data itself.
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadIssueReport(filename, issues, decisions) {
  const headers = [
    'issue_type', 'column', 'row_index', 'severity',
    'explanation', 'detected_by', 'confidence', 'decision',
  ];

  const rows = issues.map((issue) => [
    issue.issue_type,
    issue.column ?? '',
    issue.row_index ?? '',
    issue.severity,
    issue.explanation,
    issue.detected_by,
    issue.confidence,
    decisions[issue.issue_id] || 'not reviewed (defaults would apply)',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const baseName = filename ? filename.replace(/\.[^/.]+$/, '') : 'dataset';
  link.href = url;
  link.download = `${baseName}_issue_report.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
