import { hrefFor } from '../router';
import SkipLink from '../components/SkipLink';

const STAGES = [
  {
    title: 'Upload & ingestion',
    body: (
      <>
        A CSV or Excel file (.csv, .xlsx, .xls, up to 25 MB) is parsed into a table and each
        column's type is inferred automatically. Numbers stored as text — "2,000" or a price
        with a currency symbol — get a numeric view so they can still be checked as numbers.
        Nothing is configured per dataset.
      </>
    ),
  },
  {
    title: 'Detection',
    body: (
      <>
        Eight groups of independent checks run on every upload (see the table below), covering
        missing values, duplicates, outliers, inconsistent formatting, rare categories, date
        anomalies, invalid formats and impossible values, and spikes in time-ordered data.
      </>
    ),
  },
  {
    title: 'Explanation',
    body: (
      <>
        Every suggestion carries a plain-English reason, the method that found it and a
        confidence score. The most unusual outliers are explained with SHAP, other outliers by a column
        ranking, and everything else by the rule that fired. See the <a href={hrefFor('explainability')}>Explainability</a> page.
      </>
    ),
  },
  {
    title: 'Review',
    body: (
      <>
        Nothing is changed automatically. Accept or reject each suggestion — one at a time or in
        bulk — on the <a href={hrefFor('app/review')}>Review</a> screen. When you click Apply
        cleaning, every suggestion you have not rejected is applied to a working copy; the
        original upload is never touched.
      </>
    ),
  },
  {
    title: 'Cleaning & scoring',
    body: (
      <>
        The dataset is scored on four dimensions — completeness, uniqueness, validity and
        consistency — before and after cleaning, so the effect of the accepted fixes is measured,
        not assumed. The cleaned file is on the <a href={hrefFor('app/export')}>Export</a> screen,
        and every cleaning run is logged with its before and after scores.
      </>
    ),
  },
];

const DETECTOR_GROUPS = [
  ['Missing values', 'Empty cells, with a suggested fill. A column that is more than 90% empty is reported once as sparse (drop or keep) instead of cell by cell.', 'Mean, median or mode — chosen per column, with the reason given'],
  ['Duplicates', 'Exact duplicate rows and near-duplicates such as typos or spacing differences.', 'Row hashing, then fuzzy matching on the most name-like column (e-mail and code columns are skipped)'],
  ['Outliers', 'Numeric rows that are unusual compared with their neighbours.', 'Local Outlier Factor; SHAP explains the most unusual rows, z-scores the rest; row identifiers excluded'],
  ['Inconsistent formatting', 'Mixed casing, mixed date formats, numbers stored as text.', 'Rule-based'],
  ['Rare categories', 'Very rare values in low-cardinality text columns, which are likely typos.', 'Value frequency'],
  ['Date anomalies', 'Dates far outside the usual range, before 1900, or in the future.', 'Range check'],
  ['Pattern & range violations', 'Malformed e-mail and phone values, impossible values (age outside 0–120, a negative price, salary, quantity or count) and your own rules.', 'Patterns, limits and user-defined rules (min/max, allowed values, regex)'],
  ['Temporal spikes', 'In time-ordered data, a value far from its neighbouring rows.', 'Rolling window'],
];

const COVERAGE = {
  columns: ['Missing value', 'Duplicate', 'Anomaly check', 'Format inconsistency'],
  rows: [
    { type: 'Numeric', support: [true, true, true, true] },
    { type: 'Categorical', support: [true, true, true, true] },
    { type: 'Datetime', support: [true, true, true, true] },
    { type: 'Text (free-form)', support: [true, true, false, false] },
  ],
};

export default function Pipeline() {
  return (
    <>
      <SkipLink />
      <main id="main" className="content-main" tabIndex={-1}>
        <div className="content-hero">
          <p className="content-eyebrow">How EDAIC works — 1 of 2</p>
          <h1 className="content-hero-title">The Cleaning Pipeline</h1>
          <p className="content-hero-lede">
            Every uploaded dataset goes through the same five stages, with the same checks run on
            every column — no hand-written rules per dataset, and nothing is changed until you
            apply it.
          </p>
        </div>

        <div className="content-section">
          <p className="content-section-title">Five stages, one flow</p>
          <p className="content-section-lede">
            Detection always runs first, on the whole dataset, so every suggestion you review has
            a reason attached before anything is decided.
          </p>
          <div className="step-list">
            {STAGES.map((stage, i) => (
              <div key={stage.title} className="step-card">
                <span className="step-number">{i + 1}</span>
                <div>
                  <p className="step-title">{stage.title}</p>
                  <p className="step-body">{stage.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="content-section">
          <p className="content-section-title">The eight detector groups</p>
          <p className="content-section-lede">
            Each group is independent and returns suggestions in the same shape — issue type,
            column, row, severity, original and suggested value, explanation, method and
            confidence — so every kind of fix is reviewed the same way.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>What it catches</th>
                  <th>How</th>
                </tr>
              </thead>
              <tbody>
                {DETECTOR_GROUPS.map(([group, catches, how]) => (
                  <tr key={group}>
                    <td>{group}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 260 }}>{catches}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-section">
          <p className="content-section-title">Which checks run on which column type</p>
          <p className="content-section-lede">
            Free-text columns have no meaningful notion of "unusual", so they rely on the
            missing-value and duplicate checks only. Numeric columns are scored with Local Outlier
            Factor, categorical columns are checked for rare values and date columns for
            implausible dates.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Column type</th>
                  {COVERAGE.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COVERAGE.rows.map((row) => (
                  <tr key={row.type}>
                    <td>{row.type}</td>
                    {row.support.map((yes, j) => (
                      <td key={j}>{yes ? '✅' : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-section">
          <p className="content-section-title">Known limitations</p>
          <p className="content-section-lede">
            A consistently biased reviewer is not detected by the feedback loop, free-text columns
            get no anomaly check, and the quality-score weights are heuristic. Data-quality
            problems are expected; the aim is to make each one visible and explainable, not to
            hide it.
          </p>
        </div>

        <div className="content-cta">
          <a className="btn btn-primary" href={hrefFor('app/upload')}>
            Try it on your data
          </a>
          <span className="content-cta-text">
            or read how <a href={hrefFor('explainability')}>every suggestion gets explained</a>.
          </span>
        </div>
      </main>
    </>
  );
}
