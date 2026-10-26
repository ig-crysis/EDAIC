import { useEffect, useRef, useState } from 'react';

const DIMENSIONS = [
  { key: 'completeness', label: 'Completeness' },
  { key: 'uniqueness', label: 'Uniqueness' },
  { key: 'validity', label: 'Validity' },
  { key: 'consistency', label: 'Consistency' },
];

function scoreColor(score) {
  if (score >= 85) return 'var(--teal)';
  if (score >= 60) return 'var(--amber)';
  return 'var(--coral)';
}

// Counts up from the previous value, so the ring animates again when the
// score changes after cleaning instead of jumping.
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;
    const startTime = performance.now();
    let frame;

    function tick(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + (target - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

/** The original EDAIC overall-score ring with its four dimension bars. */
export default function ScoreRing({ score, caption = 'out of 100' }) {
  const overall = score?.overall_score ?? 0;
  const animated = useCountUp(overall);
  if (!score) return null;

  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - animated / 100);
  const color = scoreColor(overall);

  return (
    <div className="panel score-panel">
      <div className="score-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="score-ring-track" cx="60" cy="60" r="54" fill="none" strokeWidth="8" />
          <circle
            className="score-ring-arc"
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="score-ring-label" role="img" aria-label={`Overall quality score ${Math.round(overall)} out of 100`}>
          <span className="score-ring-value" style={{ color }}>{Math.round(animated)}</span>
          <span className="score-ring-caption">{caption}</span>
        </div>
      </div>

      <div className="score-dims">
        {DIMENSIONS.map((d) => (
          <div key={d.key} className="score-dim">
            <div className="score-dim-head">
              <span>{d.label}</span>
              <span>{score[d.key].toFixed(0)}%</span>
            </div>
            <span className="bar-chart-track">
              <span
                className="bar-chart-fill"
                style={{ width: `${score[d.key]}%`, background: scoreColor(score[d.key]) }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
