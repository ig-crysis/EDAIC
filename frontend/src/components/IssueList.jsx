import { useState, useRef, useEffect, useMemo } from 'react';
import { AlertTriangle, Info, AlertCircle, Check, X, ChevronDown, CheckCheck, XCircle, Search } from 'lucide-react';

const SEVERITY_STYLES = {
  high: { color: 'var(--color-coral)', icon: AlertCircle, label: 'High' },
  medium: { color: 'var(--color-amber)', icon: AlertTriangle, label: 'Medium' },
  low: { color: 'var(--color-text-muted)', icon: Info, label: 'Low' },
};

const TYPE_LABELS = {
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

function ExpandableBody({ expanded, children }) {
  const ref = useRef(null);
  const [maxHeight, setMaxHeight] = useState('0px');

  useEffect(() => {
    if (!ref.current) return;
    setMaxHeight(expanded ? `${ref.current.scrollHeight}px` : '0px');
  }, [expanded, children]);

  return (
    <div
      style={{ maxHeight, transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)' }}
      className="overflow-hidden"
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

function IssueRow({ issue, decision, onDecide }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low;
  const SevIcon = sev.icon;

  return (
    <div
      className="rounded-xl overflow-hidden bg-[var(--color-panel-2)] border border-[var(--color-border)] transition-shadow duration-200 hover:shadow-[0_0_0_1px_var(--color-border),0_4px_20px_-8px_rgba(0,0,0,0.5)]"
      style={{ borderLeft: `3px solid ${sev.color}` }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition"
      >
        <SevIcon size={16} style={{ color: sev.color }} className="shrink-0" />
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border font-display"
              style={{ color: sev.color, borderColor: `${sev.color}55` }}>
          {TYPE_LABELS[issue.issue_type] || issue.issue_type}
        </span>
        {issue.column && <span className="mono text-sm text-[var(--color-text-muted)]">col: {issue.column}</span>}
        {issue.row_index !== null && issue.row_index !== undefined && (
          <span className="mono text-sm text-[var(--color-text-muted)]">row: {issue.row_index}</span>
        )}
        <span className="flex-1" />
        {decision && (
          <span className={`text-xs font-medium ${decision === 'accepted' ? 'text-[var(--color-teal)]' : 'text-[var(--color-coral)]'}`}>
            {decision === 'accepted' ? 'Accepted' : 'Rejected'}
          </span>
        )}
        <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <ExpandableBody expanded={expanded}>
        <div className="px-4 pb-4 pt-1 border-t border-[var(--color-border)]">
          <p className="text-sm text-[var(--color-text)] mb-3 leading-relaxed">{issue.explanation}</p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-muted)] mb-3">
            <span>Detected by: <span className="mono text-[var(--color-text)]">{issue.detected_by}</span></span>
            <span>Confidence: <span className="mono text-[var(--color-text)]">{(issue.confidence * 100).toFixed(0)}%</span></span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onDecide(issue.issue_id, 'accepted')}
              data-testid={`accept-${issue.issue_id}`}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-teal-soft)] text-[var(--color-teal)] hover:brightness-125 transition"
            >
              <Check size={14} /> Accept fix
            </button>
            <button
              onClick={() => onDecide(issue.issue_id, 'rejected')}
              data-testid={`reject-${issue.issue_id}`}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 text-[var(--color-text-muted)] hover:text-[var(--color-coral)] hover:bg-[var(--color-coral-soft)] transition"
            >
              <X size={14} /> Reject
            </button>
          </div>
        </div>
      </ExpandableBody>
    </div>
  );
}

export default function IssueList({ issues, decisions, onDecide, onBulkDecide }) {
  const [filter, setFilter] = useState('all');
  const [columnFilter, setColumnFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const handleSearchChange = (value) => {
    setSearch(value);
    // A search box should search everything, not stay secretly scoped to
    // whichever type/column/severity tab happened to be active — typing
    // "outlier" while the "Missing value" tab is selected should find
    // outliers, not silently show zero results. Resetting the other
    // filters the moment someone starts typing keeps search behaving the
    // way anyone would expect: as a search of the whole list.
    if (value.trim() !== '') {
      setFilter('all');
      setColumnFilter('all');
      setSeverityFilter('all');
    }
  };

  const types = ['all', ...new Set(issues.map((i) => i.issue_type))];
  const typeFiltered = filter === 'all' ? issues : issues.filter((i) => i.issue_type === filter);

  // Columns available WITHIN the current type filter — e.g. filtering to
  // "Missing value" then narrowing further to just the "New Deaths"
  // column, so a bulk action can target exactly that group instead of
  // forcing someone to click through hundreds of individual rows.
  const columnsInView = useMemo(
    () => [...new Set(typeFiltered.map((i) => i.column).filter(Boolean))].sort(),
    [typeFiltered]
  );

  const columnFiltered = columnFilter === 'all'
    ? typeFiltered
    : typeFiltered.filter((i) => i.column === columnFilter);

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const severitiesInView = useMemo(
    () => [...new Set(columnFiltered.map((i) => i.severity))].sort((a, b) => severityOrder[a] - severityOrder[b]),
    [columnFiltered]
  );

  const severityFiltered = severityFilter === 'all'
    ? columnFiltered
    : columnFiltered.filter((i) => i.severity === severityFilter);

  // Search matches against column name primarily, but also falls back to
  // issue type and row index so a search box works the way someone would
  // naturally expect ("age" finds col:age, "3" finds row: 3, etc.)
  const searchQuery = search.trim().toLowerCase();
  const filtered = searchQuery === ''
    ? severityFiltered
    : severityFiltered.filter((i) => {
        const column = (i.column || '').toLowerCase();
        const rowIndex = i.row_index !== null && i.row_index !== undefined ? String(i.row_index) : '';
        const typeLabel = (TYPE_LABELS[i.issue_type] || i.issue_type || '').toLowerCase();
        return column.includes(searchQuery) || rowIndex === searchQuery || typeLabel.includes(searchQuery);
      });

  const undecidedInView = filtered.filter((i) => !decisions[i.issue_id]);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => { setFilter(t); setColumnFilter('all'); setSeverityFilter('all'); }}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-200 font-display ${
              filter === t
                ? 'bg-[var(--color-teal)] text-[#06110d] border-[var(--color-teal)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-teal)]/50'
            }`}
          >
            {t === 'all' ? `All (${issues.length})` : `${TYPE_LABELS[t] || t} (${issues.filter((i) => i.issue_type === t).length})`}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by column name, row number, or issue type…"
          className="w-full text-sm bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded-lg pl-9 pr-3 py-2 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] font-body focus:outline-none focus:border-[var(--color-teal)]/50 transition-colors"
        />
      </div>

      {columnsInView.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-[var(--color-text-muted)]">Narrow to column:</span>
          <select
            value={columnFilter}
            onChange={(e) => { setColumnFilter(e.target.value); setSeverityFilter('all'); }}
            className="text-xs font-medium bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-[var(--color-text)] font-display focus:outline-none focus:border-[var(--color-teal)]/50"
          >
            <option value="all">All columns ({typeFiltered.length})</option>
            {columnsInView.map((col) => (
              <option key={col} value={col}>
                {col} ({typeFiltered.filter((i) => i.column === col).length})
              </option>
            ))}
          </select>
        </div>
      )}

      {severitiesInView.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">Severity:</span>
          {['all', ...severitiesInView].map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize transition-all duration-200 font-display ${
                severityFilter === s
                  ? 'bg-[var(--color-violet)] text-white border-[var(--color-violet)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-violet)]/50'
              }`}
            >
              {s === 'all' ? `All (${columnFiltered.length})` : `${s} (${columnFiltered.filter((i) => i.severity === s).length})`}
            </button>
          ))}
        </div>
      )}

      {undecidedInView.length > 1 && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-[var(--color-text-muted)]">
            {undecidedInView.length} undecided in this view:
          </span>
          <button
            onClick={() => onBulkDecide(undecidedInView.map((i) => i.issue_id), 'accepted')}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-teal-soft)] text-[var(--color-teal)] hover:brightness-125 transition font-display"
          >
            <CheckCheck size={14} /> Accept all shown ({undecidedInView.length})
          </button>
          <button
            onClick={() => onBulkDecide(undecidedInView.map((i) => i.issue_id), 'rejected')}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 text-[var(--color-text-muted)] hover:text-[var(--color-coral)] hover:bg-[var(--color-coral-soft)] transition font-display"
          >
            <XCircle size={14} /> Reject all shown ({undecidedInView.length})
          </button>
        </div>
      )}

      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
        {filtered.map((issue) => (
          <IssueRow
            key={issue.issue_id}
            issue={issue}
            decision={decisions[issue.issue_id]}
            onDecide={onDecide}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
            {searchQuery ? `No issues match "${search}".` : 'No issues in this category.'}
          </p>
        )}
      </div>
    </div>
  );
}
