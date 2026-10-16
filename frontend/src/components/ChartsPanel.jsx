import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const TYPE_COLORS = {
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

const TYPE_LABELS = {
  missing_value: 'Missing values',
  duplicate: 'Duplicates',
  outlier: 'Outliers',
  inconsistent_value: 'Inconsistent',
  sparse_column: 'Sparse columns',
  rare_category: 'Rare categories',
  date_anomaly: 'Date anomalies',
  pattern_violation: 'Invalid formats',
  range_violation: 'Out of range',
  temporal_anomaly: 'Temporal spikes',
};

function ChartCard({ title, children }) {
  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl p-5">
      <h3 className="font-display text-sm font-semibold text-[var(--color-text-muted)] tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function ChartsPanel({ dashboard }) {
  if (!dashboard) return null;

  const typeData = Object.entries(dashboard.issues_by_type || {}).map(([type, count]) => ({
    name: TYPE_LABELS[type] || type,
    value: count,
    color: TYPE_COLORS[type] || '#8d93a6',
  }));

  const columnData = Object.entries(dashboard.issues_by_column || {})
    .map(([col, count]) => ({ column: col, issues: count }))
    .sort((a, b) => b.issues - a.issues);

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <ChartCard title="Issues by type">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={typeData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
              {typeData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
            </Pie>
            <Tooltip contentStyle={{ background: '#191b23', border: '1px solid #262834', borderRadius: 8, color: '#edeff4', fontFamily: 'Inter' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-3 justify-center mt-2">
          {typeData.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
              {t.name} ({t.value})
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Most affected columns">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={columnData} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262834" horizontal={false} />
            <XAxis type="number" stroke="#8d93a6" fontSize={12} allowDecimals={false} />
            <YAxis type="category" dataKey="column" stroke="#8d93a6" fontSize={12} width={90} />
            <Tooltip contentStyle={{ background: '#191b23', border: '1px solid #262834', borderRadius: 8, color: '#edeff4', fontFamily: 'Inter' }} />
            <Bar dataKey="issues" fill="#7c7cf0" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
