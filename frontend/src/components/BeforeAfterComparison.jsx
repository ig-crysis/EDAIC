import { ArrowRight, Sparkles } from 'lucide-react';

const DIMENSIONS = [
  { key: 'completeness', label: 'Completeness' },
  { key: 'uniqueness', label: 'Uniqueness' },
  { key: 'validity', label: 'Validity' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'overall_score', label: 'Overall' },
];

export default function BeforeAfterComparison({ before, after, nChanges }) {
  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={18} className="text-[var(--color-teal)]" />
        <h3 className="font-display font-semibold">Cleaning applied — {nChanges} change{nChanges !== 1 ? 's' : ''} made</h3>
      </div>
      <div className="space-y-4">
        {DIMENSIONS.map((d) => {
          const b = before[d.key];
          const a = after[d.key];
          const delta = a - b;
          return (
            <div key={d.key} className="flex items-center gap-4">
              <span className="w-28 text-sm text-[var(--color-text-muted)] shrink-0">{d.label}</span>
              <span className="mono text-sm w-12 text-right text-[var(--color-text-muted)]">{b.toFixed(0)}</span>
              <ArrowRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
              <span className="mono text-sm w-12 text-[var(--color-teal)] font-semibold">{a.toFixed(0)}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-panel-2)] overflow-hidden relative">
                <div className="h-full bg-[var(--color-border)] absolute" style={{ width: `${b}%` }} />
                <div className="h-full bg-[var(--color-teal)] absolute transition-all duration-700" style={{ width: `${a}%` }} />
              </div>
              {delta > 0 && (
                <span className="text-xs mono text-[var(--color-teal)] w-14 text-right">+{delta.toFixed(1)}</span>
              )}
              {delta <= 0 && (
                <span className="text-xs mono text-[var(--color-text-muted)] w-14 text-right">{delta.toFixed(1)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
