import { useState } from 'react';
import { ChevronDown, Check, Minus } from 'lucide-react';

// What each detector actually covers, by column type — mirrors the real
// logic in the backend (missing_values.py, duplicates.py, outliers.py,
// inconsistencies.py, categorical_dates.py), not a generic claim. LOF only
// scores numeric features; categorical and datetime columns get their own
// anomaly checks (rare values, implausible dates) instead, and free text
// gets no anomaly check — a real limitation, not an omission in this table.
const COVERAGE = {
  columns: ['Missing value', 'Duplicate', 'Anomaly check', 'Format inconsistency'],
  rows: [
    { type: 'Numeric', support: [true, true, true, true] },
    { type: 'Categorical', support: [true, true, true, true] },
    { type: 'Datetime', support: [true, true, true, true] },
    { type: 'Text (free-form)', support: [true, true, false, false] },
  ],
};

const EXAMPLES = [
  {
    kind: 'outlier',
    label: 'Outlier — via SHAP',
    accent: 'violet',
    sentence:
      "Row 142 looks unusual mainly because of its 'revenue' value (182,000), which is much higher than most rows (typical range is roughly 12,000–58,000). 'signup_date' was also somewhat unusual, but mattered less.",
  },
  {
    kind: 'missing_value',
    label: 'Missing value — from the quality profile',
    accent: 'teal',
    sentence:
      "'signup_date' is missing in this row. Suggested fill: median date (robust to a skewed distribution). Column-wide, 9 of 120 rows (7.5%) are missing this value.",
  },
  {
    kind: 'duplicate',
    label: 'Duplicate — exact or fuzzy match',
    accent: 'amber',
    sentence:
      "Rows 14 and 57 are duplicates of one another across all 6 non-identifier columns. Suggestion: keep the first occurrence (row 14) and remove the rest to avoid double-counting.",
  },
  {
    kind: 'format_inconsistency',
    label: 'Format inconsistency — rule-based',
    accent: 'coral',
    sentence:
      "'bangalore' in column 'city' appears to be a formatting variant of 'Bangalore' (differs only by case/whitespace). Standardizing to the most frequent form improves consistency for grouping and analysis.",
  },
];

const ACCENT_TEXT = {
  teal: 'text-[var(--color-teal)]',
  violet: 'text-[var(--color-violet)]',
  amber: 'text-[var(--color-amber)]',
  coral: 'text-[var(--color-coral)]',
};

export default function PipelineDetail() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <h3 className="font-display text-sm font-semibold">Detection coverage &amp; example explanations</h3>
        <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        style={{ maxHeight: open ? '1600px' : '0px', transition: 'max-height 0.5s cubic-bezier(0.16,1,0.3,1)' }}
        className="overflow-hidden"
      >
        <div className="px-5 pb-6 space-y-8">
          {/* Coverage table */}
          <div>
            <p className="text-xs font-display font-medium text-[var(--color-text-muted)] mb-3">
              Which detector runs on which column type
            </p>
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-panel-2)]">
                    <th className="text-left font-display font-medium text-xs text-[var(--color-text-muted)] px-4 py-2.5">Column type</th>
                    {COVERAGE.columns.map((c) => (
                      <th key={c} className="text-left font-display font-medium text-xs text-[var(--color-text-muted)] px-4 py-2.5">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COVERAGE.rows.map((r, i) => (
                    <tr key={r.type} className={i % 2 ? 'bg-[var(--color-panel-2)]/40' : ''}>
                      <td className="px-4 py-2.5 font-medium">{r.type}</td>
                      {r.support.map((yes, j) => (
                        <td key={j} className="px-4 py-2.5">
                          {yes
                            ? <Check size={15} className="text-[var(--color-teal)]" />
                            : <Minus size={15} className="text-[var(--color-text-muted)]/40" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
              Numeric columns are scored with Local Outlier Factor (row identifiers are left out).
              Categorical columns are checked for very rare values that look like typos, and date
              columns for dates far outside the usual range. Free-text columns have no meaningful
              notion of "unusual", so they rely on the missing-value, duplicate, and formatting
              checks only. E-mail and phone columns are checked for malformed values, impossible values
              (a negative age or price) are flagged, time-ordered data is checked for spikes against
              neighbouring rows, and custom rules can be added per dataset through the API. Columns that are almost entirely empty are reported once, as a sparse
              column, instead of being filled cell by cell.
            </p>
          </div>

          {/* Example explanations */}
          <div>
            <p className="text-xs font-display font-medium text-[var(--color-text-muted)] mb-3">
              What an explanation actually looks like, per issue kind
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {EXAMPLES.map((ex) => (
                <div key={ex.kind} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-2)]/50 p-4">
                  <p className={`text-[11px] font-display font-medium mono mb-2 ${ACCENT_TEXT[ex.accent]}`}>{ex.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">"{ex.sentence}"</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-3 leading-relaxed">
              The outlier sentence comes from SHAP attributing the anomaly score to specific
              columns; the other three are templated directly from the rule that fired — there's no
              model to explain because there's no model making that decision.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
