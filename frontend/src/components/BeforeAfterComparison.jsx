import BarChart from './BarChart';

const DIMENSIONS = [
  { key: 'completeness', label: 'Completeness' },
  { key: 'uniqueness', label: 'Uniqueness' },
  { key: 'validity', label: 'Validity' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'overall_score', label: 'Overall' },
];

const formatPct = (v) => `${v.toFixed(0)}%`;

export default function BeforeAfterComparison({ before, after, nChanges }) {
  const legend = [
    { label: 'Before cleaning', color: 'var(--muted)' },
    { label: 'After cleaning', color: 'var(--status-good)' },
  ];

  const groups = DIMENSIONS.map((d) => ({
    label: d.label,
    rows: [
      { label: 'Before', value: before[d.key], color: 'var(--muted)' },
      { label: 'After', value: after[d.key], color: 'var(--status-good)' },
    ],
  }));

  return (
    <div className="panel">
      <p className="panel-title">
        Cleaning applied — {nChanges} change{nChanges !== 1 ? 's' : ''} made
      </p>
      <p className="panel-hint">Quality score on each dimension, before and after the accepted fixes.</p>

      <BarChart legend={legend} groups={groups} maxValue={100} formatValue={formatPct} />

      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Before</th>
              <th>After</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {DIMENSIONS.map((d) => {
              const delta = after[d.key] - before[d.key];
              return (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  <td>{formatPct(before[d.key])}</td>
                  <td>{formatPct(after[d.key])}</td>
                  <td style={{ color: delta > 0 ? 'var(--status-good)' : 'var(--muted)' }}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
