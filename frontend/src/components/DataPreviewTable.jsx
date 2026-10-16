import { useEffect, useState } from 'react';
import { Table2, Sparkles, Search, X } from 'lucide-react';
import { getPreview } from '../api/client';

const ROWS_PER_PAGE = 8;

export default function DataPreviewTable({ datasetId, hasCleanedVersion }) {
  const [tab, setTab] = useState('original');
  const [preview, setPreview] = useState(null);
  const [cleanedPreview, setCleanedPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  // Both previews are fetched with the SAME start offset, so row position
  // i in "original" always corresponds to row position i in "cleaned" —
  // this keeps the cell-change diffing below correct even after jumping
  // to an arbitrary row via search.
  const [start, setStart] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const [targetRow, setTargetRow] = useState(null);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPreview(datasetId, { rows: ROWS_PER_PAGE, cleaned: false, start })
      .then((data) => { if (!cancelled) setPreview(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [datasetId, start]);

  useEffect(() => {
    if (!hasCleanedVersion) return;
    let cancelled = false;
    getPreview(datasetId, { rows: ROWS_PER_PAGE, cleaned: true, start }).then((data) => {
      if (!cancelled) setCleanedPreview(data);
    });
    return () => { cancelled = true; };
  }, [datasetId, hasCleanedVersion, start]);

  // Jumps live as the person types, instead of requiring them to press
  // Enter or find a hidden submit button — matches the issue-list search
  // box right below it, which also filters live. A short debounce avoids
  // firing a new preview fetch on every single keystroke while typing a
  // multi-digit row number.
  useEffect(() => {
    if (searchValue.trim() === '') {
      setTargetRow(null);
      setSearchError(null);
      return;
    }

    const timeout = setTimeout(() => {
      const target = parseInt(searchValue, 10);
      const totalKnown = (tab === 'cleaned' ? cleanedPreview : preview)?.total_rows;

      if (isNaN(target) || target < 0) {
        setSearchError('Enter a valid row number');
        setTargetRow(null);
        return;
      }
      if (totalKnown !== undefined && target >= totalKnown) {
        setSearchError(`This dataset only has rows 0–${totalKnown - 1}`);
        setTargetRow(null);
        return;
      }
      setSearchError(null);
      setTargetRow(target);
      // Show a little context before the target row rather than putting
      // it right at the top of the page.
      setStart(Math.max(0, target - 1));
    }, 350);

    return () => clearTimeout(timeout);
  }, [searchValue, tab]);

  const clearSearch = () => {
    setSearchValue('');
    setTargetRow(null);
    setSearchError(null);
    setStart(0);
  };

  if (loading || !preview) {
    return (
      <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl p-6 h-48 animate-pulse" />
    );
  }

  const active = tab === 'cleaned' && cleanedPreview ? cleanedPreview : preview;
  // Row-position diffing only makes sense when no rows were removed —
  // if duplicate rows were dropped during cleaning, every row after the
  // removed one shifts position, which would make positional comparison
  // falsely flag entire unchanged rows as "changed". Only diff when row
  // counts match, so we never show a misleading highlight.
  const canDiff = tab === 'cleaned' && cleanedPreview && cleanedPreview.total_rows === preview.total_rows;
  const compareAgainst = canDiff ? preview : null;
  const rowsWereRemoved = tab === 'cleaned' && cleanedPreview && cleanedPreview.total_rows < preview.total_rows;

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h3 className="font-display text-sm font-semibold text-[var(--color-text-muted)] flex items-center gap-2">
          <Table2 size={15} /> Data preview
        </h3>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="number"
                min="0"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Jump to row…"
                className="w-32 text-xs bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded-lg pl-7 pr-2 py-1.5 text-[var(--color-text)] font-display focus:outline-none focus:border-[var(--color-teal)]/50"
              />
            </div>
            {targetRow !== null && (
              <button type="button" onClick={clearSearch} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                <X size={14} />
              </button>
            )}
          </div>

          {hasCleanedVersion && (
            <div className="flex gap-1 bg-[var(--color-panel-2)] rounded-full p-1">
              {['original', 'cleaned'].map((t) => (
                <button
                  key={t}
                  data-testid={`preview-tab-${t}`}
                  onClick={() => setTab(t)}
                  className={`text-xs font-medium font-display px-3 py-1 rounded-full transition-all duration-200 capitalize ${
                    tab === t
                      ? 'bg-[var(--color-teal)] text-[#06110d]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchError && (
        <div className="px-5 pb-2 text-xs text-[var(--color-coral)]">{searchError}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-b border-[var(--color-border)]">
              <th className="text-left px-4 py-2 font-display font-medium text-xs text-[var(--color-text-muted)] whitespace-nowrap">#</th>
              {active.columns.map((col) => (
                <th key={col} className="text-left px-4 py-2 font-display font-medium text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.rows.map((row, i) => {
              const isTargetRow = targetRow !== null && row._row_index === targetRow;
              return (
                <tr
                  key={i}
                  className={`border-b border-[var(--color-border)] last:border-0 ${
                    isTargetRow ? 'bg-[var(--color-violet-soft)]' : ''
                  }`}
                  style={isTargetRow ? { boxShadow: 'inset 3px 0 0 var(--color-violet)' } : undefined}
                >
                  <td className="px-4 py-2 mono text-xs text-[var(--color-text-muted)]">{row._row_index}</td>
                  {active.columns.map((col) => {
                    const value = row[col];
                    const changed = compareAgainst?.rows[i] && String(compareAgainst.rows[i][col]) !== String(value);
                    return (
                      <td
                        key={col}
                        className={`px-4 py-2 mono text-xs whitespace-nowrap ${
                          changed ? 'text-[var(--color-teal)] bg-[var(--color-teal-soft)]' : 'text-[var(--color-text)]'
                        }`}
                      >
                        {value === null || value === undefined || value === '' ? (
                          <span className="text-[var(--color-text-muted)] italic">empty</span>
                        ) : (
                          String(value)
                        )}
                        {changed && <Sparkles size={10} className="inline ml-1.5 text-[var(--color-teal)]" />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-2.5 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
        Showing rows {active.start}–{active.start + active.showing - 1} of {active.total_rows}
        {canDiff && ' — teal highlights show cells changed by cleaning'}
        {rowsWereRemoved && ' — duplicate rows were removed, so row positions below have shifted and are not highlighted cell-by-cell'}
        {targetRow !== null && <span className="text-[var(--color-violet)]"> — highlighted row is your search result</span>}
      </div>
    </div>
  );
}
