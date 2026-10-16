import { useState } from 'react';
import { ChevronDown, Search, Brain, UserCheck, LineChart } from 'lucide-react';

const STEPS = [
  {
    icon: Search,
    title: 'Detect',
    body: 'Eight groups of independent checks run on every upload: missing values (including sparse columns), exact and fuzzy duplicates, outliers (Local Outlier Factor), format inconsistencies (casing, date formats, numeric formatting), rare categories, date anomalies, pattern and range violations (e-mail, phone, impossible values, user-defined rules), and temporal spikes in time-ordered data.',
  },
  {
    icon: Brain,
    title: 'Explain',
    body: 'Rule-based issues (every group except outliers) are inherently interpretable — the fix reasoning is the logic itself. Outliers are explained using SHAP, which attributes a model\u2019s anomaly score to the specific columns that drove it, rather than just flagging a row as "unusual".',
  },
  {
    icon: UserCheck,
    title: 'Review',
    body: 'Nothing is changed automatically. Every suggested fix is reviewed individually — accept, reject, or apply the defaults — before anything touches the dataset. This matters because "statistically unusual" and "actually wrong" aren\u2019t always the same thing.',
  },
  {
    icon: LineChart,
    title: 'Score',
    body: 'A quality score is computed across four dimensions \u2014 completeness, uniqueness, validity, consistency \u2014 both before and after cleaning, so the impact of accepted fixes is measurable, not just assumed.',
  },
];

export default function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <h3 className="font-display text-sm font-semibold">How this pipeline works</h3>
        <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        style={{ maxHeight: open ? '600px' : '0px', transition: 'max-height 0.4s cubic-bezier(0.16,1,0.3,1)' }}
        className="overflow-hidden"
      >
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-border)] flex items-center justify-center mt-0.5">
                  <Icon size={15} className="text-[var(--color-violet)]" />
                </div>
                <div>
                  <p className="font-display text-sm font-medium mb-1">
                    <span className="mono text-xs text-[var(--color-text-muted)] mr-1.5">0{i + 1}</span>
                    {step.title}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{step.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
