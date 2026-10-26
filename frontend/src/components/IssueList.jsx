import { useState, useMemo } from 'react';
import { TYPE_LABELS } from '../issueTypes';

const SEVERITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function Chevron() {
  return (
    <svg className="issue-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IssueRow({ issue, decision, onDecide }) {
  const [expanded, setExpanded] = useState(false);
  const severity = SEVERITY_LABELS[issue.severity] ? issue.severity : 'low';

  return (
    <div className={`issue issue-${severity}${expanded ? ' is-open' : ''}`}>
      <button
        type="button"
        className="issue-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className={`badge badge-${severity}`}>{SEVERITY_LABELS[severity]}</span>
        <span className="issue-type">{TYPE_LABELS[issue.issue_type] || issue.issue_type}</span>
        {issue.column && <span className="issue-meta">col: {issue.column}</span>}
        {issue.row_index !== null && issue.row_index !== undefined && (
          <span className="issue-meta">row: {issue.row_index}</span>
        )}
        <span className="issue-spacer" />
        {decision && (
          <span className={`badge ${decision === 'accepted' ? 'badge-approved' : 'badge-rejected'}`}>
            {decision === 'accepted' ? 'Accepted' : 'Rejected'}
          </span>
        )}
        <Chevron />
      </button>

      {expanded && (
        <div className="issue-body fade-in-item">
          <p className="issue-explanation">{issue.explanation}</p>
          <div className="issue-facts">
            <span>Detected by: <strong>{issue.detected_by}</strong></span>
            <span>Confidence: <strong>{(issue.confidence * 100).toFixed(0)}%</strong></span>
          </div>
          <div className="issue-actions">
            <button
              type="button"
              onClick={() => onDecide(issue.issue_id, 'accepted')}
              data-testid={`accept-${issue.issue_id}`}
              className="btn btn-approve btn-sm"
            >
              Accept fix
            </button>
            <button
              type="button"
              onClick={() => onDecide(issue.issue_id, 'rejected')}
              data-testid={`reject-${issue.issue_id}`}
              className="btn btn-reject btn-sm"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IssueList({ issues, decisions, onDecide, onBulkDecide }) {
  const [filter, setFilter] = useState('all');
  const [columnFilter, setColumnFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

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
  // "Missing value" then narrowing further to a single column, so a bulk
  // action can target exactly that group instead of forcing someone to
  // click through hundreds of individual rows.
  const columnsInView = useMemo(
    () => [...new Set(typeFiltered.map((i) => i.column).filter(Boolean))].sort(),
    [typeFiltered]
  );

  const columnFiltered = columnFilter === 'all'
    ? typeFiltered
    : typeFiltered.filter((i) => i.column === columnFilter);

  const severitiesInView = useMemo(
    () => [...new Set(columnFiltered.map((i) => i.severity))].sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b]),
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
    <div>
      <div className="chip-row">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setFilter(t); setColumnFilter('all'); setSeverityFilter('all'); }}
            className={`chip${filter === t ? ' is-active' : ''}`}
          >
            {t === 'all' ? `All (${issues.length})` : `${TYPE_LABELS[t] || t} (${issues.filter((i) => i.issue_type === t).length})`}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <div className="field" style={{ flex: '1 1 280px' }}>
          <label htmlFor="issue-search">Search</label>
          <input
            id="issue-search"
            className="input"
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Column name, row number or issue type…"
          />
        </div>

        {columnsInView.length > 1 && (
          <div className="field">
            <label htmlFor="issue-column">Narrow to column</label>
            <select
              id="issue-column"
              className="input"
              value={columnFilter}
              onChange={(e) => { setColumnFilter(e.target.value); setSeverityFilter('all'); }}
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
      </div>

      {severitiesInView.length > 1 && (
        <div className="chip-row">
          <span className="chip-row-label">Severity</span>
          {['all', ...severitiesInView].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={`chip${severityFilter === s ? ' is-active' : ''}`}
            >
              {s === 'all' ? `All (${columnFiltered.length})` : `${SEVERITY_LABELS[s] || s} (${columnFiltered.filter((i) => i.severity === s).length})`}
            </button>
          ))}
        </div>
      )}

      {undecidedInView.length > 1 && (
        <div className="bulk-row">
          <span className="chip-row-label">{undecidedInView.length} undecided in this view</span>
          <button
            type="button"
            className="btn btn-approve btn-sm"
            onClick={() => onBulkDecide(undecidedInView.map((i) => i.issue_id), 'accepted')}
          >
            Accept all shown ({undecidedInView.length})
          </button>
          <button
            type="button"
            className="btn btn-reject btn-sm"
            onClick={() => onBulkDecide(undecidedInView.map((i) => i.issue_id), 'rejected')}
          >
            Reject all shown ({undecidedInView.length})
          </button>
        </div>
      )}

      <div className="issue-list">
        {filtered.map((issue) => (
          <IssueRow
            key={issue.issue_id}
            issue={issue}
            decision={decisions[issue.issue_id]}
            onDecide={onDecide}
          />
        ))}
        {filtered.length === 0 && (
          <p className="panel-hint" style={{ textAlign: 'center', padding: '24px 0', margin: 0 }}>
            {searchQuery ? `No issues match "${search}".` : 'No issues in this category.'}
          </p>
        )}
      </div>
    </div>
  );
}
