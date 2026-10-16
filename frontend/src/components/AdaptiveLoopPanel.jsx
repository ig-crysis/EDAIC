import { useState } from 'react';
import { ChevronDown, Gauge, RotateCcw, Info } from 'lucide-react';

/**
 * Shows the state of the adaptive feedback loop: every accept/reject
 * decision made on an OUTLIER issue is logged, and once 5 new ones have
 * come in, the outlier detector's sensitivity (contamination) is nudged
 * up or down within safe bounds based on how many were accepted vs
 * rejected. This panel makes that mechanism visible instead of hidden —
 * including its honest limitations.
 */
export default function AdaptiveLoopPanel({ state, onReset, isResetting }) {
  const [open, setOpen] = useState(false);

  if (!state) return null;

  const {
    contamination, default_contamination, min, max, step, batch_size,
    total_outlier_decisions, accepted_outlier_decisions, rejected_outlier_decisions,
    decisions_since_last_adjustment, accept_rate, history,
  } = state;

  const rangePct = ((contamination - min) / (max - min)) * 100;
  const defaultPct = ((default_contamination - min) / (max - min)) * 100;
  const changedFromDefault = contamination !== default_contamination;

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-[var(--color-violet)]" />
          <h3 className="font-display text-sm font-semibold">Adaptive feedback loop</h3>
          <span className="text-xs font-normal font-body text-[var(--color-text-muted)] hidden sm:inline">
            — outlier sensitivity: <span className="mono text-[var(--color-text)]">{(contamination * 100).toFixed(1)}%</span>
            {changedFromDefault && (
              <span className="text-[var(--color-violet)]"> (adjusted from default)</span>
            )}
          </span>
        </div>
        <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        style={{ maxHeight: open ? '900px' : '0px', transition: 'max-height 0.4s cubic-bezier(0.16,1,0.3,1)' }}
        className="overflow-hidden"
      >
        <div className="px-5 pb-5 space-y-5">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            Every accept/reject decision on an outlier issue is logged here. Once {batch_size} new
            decisions come in, the detector's sensitivity is nudged up (if you mostly accept flagged
            outliers) or down (if you mostly reject them), within a fixed safe range (recent decisions weigh more than old ones). Missing-value,
            duplicate, and formatting decisions are logged too but don't move anything — those
            detectors are rule-based, so there's no sensitivity for them to tune.
          </p>

          <div>
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1.5">
              <span>Sensitivity (contamination)</span>
              <span className="mono">{min.toFixed(2)} – {max.toFixed(2)}</span>
            </div>
            <div className="relative h-2.5 rounded-full bg-[var(--color-panel-2)] overflow-visible">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[var(--color-border)]"
                style={{ left: `${defaultPct}%` }}
                title="Default"
              />
              <div
                className="h-full rounded-full bg-[var(--color-violet)] transition-all duration-500"
                style={{ width: `${rangePct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--color-violet)] shadow-[0_0_0_3px_var(--color-panel)] transition-all duration-500"
                style={{ left: `calc(${rangePct}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between text-[10px] mono text-[var(--color-text-muted)] mt-1">
              <span>{min.toFixed(2)}</span>
              <span>default {default_contamination.toFixed(2)}</span>
              <span>{max.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Outlier decisions" value={total_outlier_decisions} />
            <Stat label="Accepted" value={accepted_outlier_decisions} accent="teal" />
            <Stat label="Rejected" value={rejected_outlier_decisions} accent="coral" />
            <Stat
              label="Accept rate"
              value={accept_rate === null ? '—' : `${Math.round(accept_rate * 100)}%`}
            />
          </div>

          {decisions_since_last_adjustment > 0 && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {decisions_since_last_adjustment} of {batch_size} decisions logged toward the next
              re-evaluation.
            </p>
          )}

          {history.length > 0 && (
            <div>
              <p className="text-xs font-display font-medium text-[var(--color-text-muted)] mb-2">
                Adjustment history
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {[...history].reverse().map((h, i) => (
                  <div key={i} className="text-xs bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mono mb-0.5">
                      <span>{h.from.toFixed(3)}</span>
                      <span className="text-[var(--color-text-muted)]">→</span>
                      <span className={h.to > h.from ? 'text-[var(--color-teal)]' : 'text-[var(--color-coral)]'}>
                        {h.to.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-[var(--color-text-muted)] leading-snug">{h.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed max-w-md">
              Recent decisions count more than old ones, and a batch where you reverse earlier decisions
              on the same cell is held, not applied. Known limitation: a consistently biased reviewer
              is not detected — it's a simple, honest mechanism, not a solved research problem.
            </p>
            <button
              onClick={onReset}
              disabled={isResetting}
              className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-coral)]/50 transition disabled:opacity-50"
            >
              <RotateCcw size={12} /> {isResetting ? 'Resetting…' : 'Reset sensitivity'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  const color = accent === 'teal' ? 'text-[var(--color-teal)]'
    : accent === 'coral' ? 'text-[var(--color-coral)]'
    : 'text-[var(--color-text)]';
  return (
    <div className="bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded-lg px-3 py-2">
      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">{label}</p>
      <p className={`mono text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
