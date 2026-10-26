import Screen, { NoDataset } from '../components/Screen';
import ScoreRing from '../components/ScoreRing';
import ColumnProfileTable from '../components/ColumnProfileTable';
import BarChart from '../components/BarChart';
import { TYPE_LABELS, TYPE_COLORS } from '../issueTypes';

const SUBTITLE =
  'Dataset-level quality scores and per-column completeness, computed before anything is changed.';

function countRows(counts, labelFor, colorFor) {
  return Object.entries(counts || {})
    .map(([key, value]) => ({ label: labelFor(key), value, color: colorFor(key) }))
    .sort((a, b) => b.value - a.value);
}

export default function ProfileScreen({ session }) {
  const { analysis, dashboard, isCleaned, cleaningResult } = session;

  if (!analysis) {
    return (
      <Screen title="Data Quality Profile" subtitle={SUBTITLE}>
        <NoDataset />
      </Screen>
    );
  }

  const score = isCleaned ? cleaningResult.after_score : analysis.quality_score;
  const typeRows = countRows(dashboard?.issues_by_type, (t) => TYPE_LABELS[t] || t, (t) => TYPE_COLORS[t] || 'var(--muted)');
  const columnRows = countRows(dashboard?.issues_by_column, (c) => c, () => 'var(--violet)');

  return (
    <Screen title="Data Quality Profile" subtitle={SUBTITLE}>
      <ScoreRing score={score} caption={isCleaned ? 'after cleaning' : 'out of 100'} />

      <div className="metric-row">
        <div className="metric">
          <div className="metric-value">{analysis.issues.length}</div>
          <div className="metric-label">Issues found</div>
        </div>
        <div className="metric">
          <div className="metric-value">{analysis.n_rows}</div>
          <div className="metric-label">Rows</div>
        </div>
        <div className="metric">
          <div className="metric-value">{analysis.n_columns}</div>
          <div className="metric-label">Columns</div>
        </div>
      </div>

      <ColumnProfileTable columns={analysis.columns} />

      <div className="panel">
        <p className="panel-title">Issues by type</p>
        {typeRows.length === 0 ? (
          <p className="panel-hint" style={{ margin: 0 }}>No issues were detected.</p>
        ) : (
          <>
            <p className="panel-hint">Number of suggestions from each detector group.</p>
            <BarChart
              wide
              maxValue={Math.max(1, ...typeRows.map((r) => r.value))}
              formatValue={String}
              groups={[{ label: '', rows: typeRows }]}
            />
          </>
        )}
      </div>

      {columnRows.length > 0 && (
        <div className="panel">
          <p className="panel-title">Most affected columns</p>
          <p className="panel-hint">Columns with the most suggestions.</p>
          <BarChart
            wide
            maxValue={Math.max(1, ...columnRows.map((r) => r.value))}
            formatValue={String}
            groups={[{ label: '', rows: columnRows }]}
          />
        </div>
      )}
    </Screen>
  );
}
