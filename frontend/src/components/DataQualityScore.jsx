import { useEffect, useState, useRef } from 'react';

const DIMENSIONS = [
  { key: 'completeness', label: 'Completeness' },
  { key: 'uniqueness', label: 'Uniqueness' },
  { key: 'validity', label: 'Validity' },
  { key: 'consistency', label: 'Consistency' },
];

function scoreColor(score) {
  if (score >= 85) return 'var(--color-teal)';
  if (score >= 60) return 'var(--color-amber)';
  return 'var(--color-coral)';
}

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    prevTarget.current = target;
  }, [target, duration]);

  return value;
}

export default function DataQualityScore({ score }) {
  const overall = score?.overall_score ?? 0;
  const animatedOverall = useCountUp(overall);

  if (!score) return null;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - animatedOverall / 100);
  const color = scoreColor(overall);

  return (
    <div className="panel-accent relative bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-8 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{ background: `radial-gradient(circle at 15% 20%, ${color}, transparent 45%)` }}
      />

      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--color-border)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke 0.4s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-semibold mono" style={{ color }}>
            {Math.round(animatedOverall)}
          </span>
          <span className="text-xs text-[var(--color-text-muted)] mt-0.5">out of 100</span>
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-x-8 gap-y-4 flex-1 w-full">
        {DIMENSIONS.map((d) => (
          <div key={d.key}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-[var(--color-text-muted)]">{d.label}</span>
              <span className="mono font-medium">{score[d.key].toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-panel-2)] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${score[d.key]}%`, background: scoreColor(score[d.key]) }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
