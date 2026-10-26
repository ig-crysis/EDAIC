import { hrefFor } from '../router';
import SkipLink from '../components/SkipLink';

const EXAMPLES = [
  {
    kind: 'outlier — via SHAP',
    sentence:
      "Row 142 looks unusual mainly because of its 'revenue' value (182,000), which is much higher than most rows (typical range is roughly 12,000–58,000). 'signup_date' was also somewhat unusual, but mattered less.",
  },
  {
    kind: 'missing_value — from the quality profile',
    sentence:
      "'signup_date' is missing in this row. Suggested fill: median date (robust to a skewed distribution). Column-wide, 9 of 120 rows (7.5%) are missing this value.",
  },
  {
    kind: 'duplicate — exact or fuzzy match',
    sentence:
      'Rows 14 and 57 are duplicates of one another across all 6 non-identifier columns. Suggestion: keep the first occurrence (row 14) and remove the rest to avoid double-counting.',
  },
  {
    kind: 'inconsistent_value — rule-based',
    sentence:
      "'bangalore' in column 'city' appears to be a formatting variant of 'Bangalore' (differs only by case/whitespace). Standardizing to the most frequent form improves consistency for grouping and analysis.",
  },
];

export default function Explainability() {
  return (
    <>
      <SkipLink />
      <main id="main" className="content-main" tabIndex={-1}>
        <div className="content-hero">
          <p className="content-eyebrow">How EDAIC works — 2 of 2</p>
          <h1 className="content-hero-title">Explainability, Not Just A Flag</h1>
          <p className="content-hero-lede">
            Telling someone a row is "an outlier" is not something they can act on with
            confidence. Every suggestion gets a sentence that names the actual column, the actual
            value and the actual reason.
          </p>
        </div>

        <div className="content-section">
          <p className="content-section-title">Two kinds of explanation</p>
          <p className="content-section-lede">
            Which one you see depends on what produced the suggestion. Rule-based checks are
            interpretable by construction; the one model-based check, outlier detection, is
            explained with SHAP (SHapley Additive exPlanations).
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Suggestion</th>
                  <th>Explained by</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ whiteSpace: 'normal', minWidth: 200 }}>
                    Missing values, duplicates, inconsistent formatting, rare categories, date
                    anomalies, pattern and range violations, temporal spikes
                  </td>
                  <td style={{ whiteSpace: 'normal', minWidth: 140 }}>The rule itself</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 260 }}>
                    There is no model making the decision, so the reasoning is the logic — for
                    example "median used because the column is skewed".
                  </td>
                </tr>
                <tr>
                  <td>Outliers</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 140 }}>
                    SHAP on the Local Outlier Factor score
                  </td>
                  <td style={{ whiteSpace: 'normal', minWidth: 260 }}>
                    Attributes the anomaly score to individual columns for that specific row, so
                    the answer is "unusual mainly because of <em>revenue</em>", not just
                    "unusual". If SHAP cannot finish on a given dataset, a z-score explanation
                    is used instead so the pipeline never breaks.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-section">
          <p className="content-section-title">Every kind of fix has an actual sentence</p>
          <p className="content-section-lede">
            Four examples of what a suggestion's explanation reads like. Only the outlier sentence
            comes from SHAP; the other three are written directly from the rule that fired.
          </p>
          <div className="example-grid">
            {EXAMPLES.map((example) => (
              <div key={example.kind} className="example-card">
                <span className="example-kind">{example.kind}</span>
                <p className="example-sentence">{example.sentence}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="content-section">
          <p className="content-section-title">What you see on the Review screen</p>
          <p className="content-section-lede">
            Expand any suggestion on the <a href={hrefFor('app/review')}>Review</a> screen and you
            get, together: the explanation, the method that detected it (<code>detected_by</code>),
            a confidence score and its severity — then accept or reject it. That decision is
            logged, and for outliers it feeds the adaptive loop below.
          </p>
        </div>

        <div className="content-section">
          <p className="content-section-title">A feedback loop you can inspect</p>
          <p className="content-section-lede">
            Accept and reject decisions on outliers adjust the detector's sensitivity within fixed
            bounds: after every 5 new decisions it is nudged up if you mostly accept the flagged
            outliers, and down if you mostly reject them. Recent decisions count more than old
            ones, and a batch that reverses earlier decisions on the same cell is held instead of
            applied. The current sensitivity and its full history are on the{' '}
            <a href={hrefFor('app/admin')}>Admin</a> screen.
          </p>
        </div>

        <div className="content-cta">
          <a className="btn btn-primary" href={hrefFor('app/review')}>
            Open the Review screen
          </a>
          <span className="content-cta-text">
            or see <a href={hrefFor('pipeline')}>how these issues get found</a> in the first
            place.
          </span>
        </div>
      </main>
    </>
  );
}
