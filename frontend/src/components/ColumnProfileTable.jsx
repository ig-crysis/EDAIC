function missingStatus(missingPct) {
  if (missingPct === 0) return 'var(--status-good)';
  if (missingPct < 20) return 'var(--status-warning)';
  return 'var(--status-critical)';
}

export default function ColumnProfileTable({ columns }) {
  if (!columns || columns.length === 0) return null;

  return (
    <div className="panel">
      <p className="panel-title">Column profile</p>
      <p className="panel-hint">
        {columns.length} columns — inferred type, share of missing values and number of distinct values.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Missing</th>
              <th>Unique values</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name}>
                <td>{col.name}</td>
                <td>{col.dtype}</td>
                <td>
                  <div className="mini-bar">
                    <span className="mini-bar-value" style={{ color: missingStatus(col.missing_pct) }}>
                      {col.missing_pct.toFixed(1)}%
                    </span>
                    <span className="bar-chart-track">
                      <span
                        className="bar-chart-fill"
                        style={{ width: `${col.missing_pct}%`, background: missingStatus(col.missing_pct) }}
                      />
                    </span>
                  </div>
                </td>
                <td>{col.unique_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
