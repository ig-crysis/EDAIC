/**
 * Dependency-free bar chart, ported from ADQI's landing/app/charts.js: one
 * axis, fixed color order, direct value labels, and a legend whenever more
 * than one series is shown. Every chart sits next to (or above) a table of the
 * same numbers, so the chart is never the only way to read them.
 *
 * groups: [{ label, rows: [{ label, value, color }] }]
 */
export default function BarChart({ legend, groups, maxValue = 1, formatValue = (v) => v.toFixed(2), wide = false }) {
  return (
    <>
      {legend && legend.length > 1 && (
        <div className="chart-legend">
          {legend.map((item) => (
            <span key={item.label} className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div className={`bar-chart${wide ? ' bar-chart-wide' : ''}`}>
        {groups.map((group, gi) => (
          <div key={group.label || gi} className="bar-chart-group">
            {group.label && <div className="bar-chart-group-label">{group.label}</div>}
            {group.rows.map((row) => {
              const pct = Math.max(0, Math.min(100, (row.value / maxValue) * 100));
              return (
                <div key={row.label} className="bar-chart-row">
                  <span className="bar-chart-row-label">{row.label}</span>
                  <span className="bar-chart-track">
                    <span className="bar-chart-fill" style={{ width: `${pct}%`, background: row.color }} />
                  </span>
                  <span className="bar-chart-value">{formatValue(row.value)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
