import { useEffect, useState } from 'react';
import { getPreview } from '../api/client';

const ROWS_PER_PAGE = 8;

export default function DataPreviewTable({ datasetId, hasCleanedVersion, title = 'Data preview' }) {
  const [tab, setTab] = useState('original');
  const [preview, setPreview] = useState(null);
  const [cleanedPreview, setCleanedPreview] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

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
    getPreview(datasetId, { rows: ROWS_PER_PAGE, cleaned: false, start })
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [datasetId, start]);

  useEffect(() => {
    if (!hasCleanedVersion) return;
    let cancelled = false;
    getPreview(datasetId, { rows: ROWS_PER_PAGE, cleaned: true, start })
      .then((data) => {
        if (!cancelled) setCleanedPreview(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [datasetId, hasCleanedVersion, start]);

  // Jumps live as the person types, instead of requiring them to press
  // Enter. A short debounce avoids firing a new preview fetch on every
  // keystroke while typing a multi-digit row number.
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

  const active = preview && tab === 'cleaned' && cleanedPreview ? cleanedPreview : preview;
  // Row-position diffing only makes sense when no rows were removed —
  // if duplicate rows were dropped during cleaning, every row after the
  // removed one shifts position, which would make positional comparison
  // falsely flag entire unchanged rows as "changed". Only diff when row
  // counts match, so we never show a misleading highlight.
  const canDiff = !!preview && tab === 'cleaned' && cleanedPreview && cleanedPreview.total_rows === preview.total_rows;
  const compareAgainst = canDiff ? preview : null;
  const rowsWereRemoved = !!preview && tab === 'cleaned' && cleanedPreview && cleanedPreview.total_rows < preview.total_rows;

  return (
    <div className="panel">
      <div className="preview-head">
        <div>
          <p className="panel-title">{title}</p>
          <p className="panel-hint">Jump to any row by number{hasCleanedVersion ? ', or switch between the original and cleaned data' : ''}.</p>
        </div>

        <div className="preview-controls">
          <input
            className="input num-input"
            type="number"
            min="0"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Jump to row…"
            aria-label="Jump to row"
          />
          {targetRow !== null && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearSearch}>
              Clear
            </button>
          )}
          {hasCleanedVersion && (
            <div className="chip-row">
              {['original', 'cleaned'].map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`preview-tab-${t}`}
                  onClick={() => setTab(t)}
                  className={`chip${tab === t ? ' is-active' : ''}`}
                >
                  {t === 'original' ? 'Original' : 'Cleaned'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchError && <p className="field-error">{searchError}</p>}

      {!active ? (
        <p className="panel-hint" style={{ margin: 0 }}>
          {loadFailed ? 'The preview could not be loaded.' : 'Loading preview…'}
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  {active.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.rows.map((row, i) => {
                  const isTargetRow = targetRow !== null && row._row_index === targetRow;
                  return (
                    <tr key={i} className={isTargetRow ? 'is-selected row-target' : ''}>
                      <td className="cell-index">{row._row_index}</td>
                      {active.columns.map((col) => {
                        const value = row[col];
                        const changed = compareAgainst?.rows[i] && String(compareAgainst.rows[i][col]) !== String(value);
                        return (
                          <td key={col} className={changed ? 'cell-changed' : undefined}>
                            {value === null || value === undefined || value === '' ? (
                              <span className="cell-empty">empty</span>
                            ) : (
                              String(value)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="preview-foot">
            Showing rows {active.start}–{active.start + active.showing - 1} of {active.total_rows}
            {canDiff && ' — green cells were changed by cleaning'}
            {rowsWereRemoved && ' — duplicate rows were removed, so row positions below have shifted and are not highlighted cell-by-cell'}
            {targetRow !== null && ' — the highlighted row is your search result'}
          </p>
        </>
      )}
    </div>
  );
}
