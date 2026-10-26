import { useCallback, useEffect, useState } from 'react';
import { hrefFor } from '../router';
import { getAdaptiveState, resetAdaptiveState, extractErrorMessage } from '../api/client';
import { useToast } from '../toastContext';
import Screen, { ErrorBanner } from '../components/Screen';

export default function AdminScreen() {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdaptiveState()
      .then((res) => {
        if (!cancelled) setState(res);
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, []);

  const handleReset = useCallback(async () => {
    setIsResetting(true);
    try {
      setState(await resetAdaptiveState());
      setError(null);
      toast('Sensitivity reset to the default.');
    } catch (err) {
      toast(extractErrorMessage(err), 'error');
    } finally {
      setIsResetting(false);
    }
  }, [toast]);

  const subtitle = (
    <>
      The outlier detector's current sensitivity and the decision history behind it. Separate
      from the day-to-day <a href={hrefFor('app/review')}>Review</a> flow.
    </>
  );

  if (!state) {
    return (
      <Screen title="Adaptive Sensitivity Monitor" subtitle={subtitle}>
        <ErrorBanner message={error} />
        {!error && <div className="state-message">Loading adaptive state…</div>}
      </Screen>
    );
  }

  const {
    contamination, default_contamination, min, max, step, batch_size,
    total_outlier_decisions, accepted_outlier_decisions, rejected_outlier_decisions,
    decisions_since_last_adjustment, accept_rate, recent_accept_rate,
    accept_threshold, reject_threshold, decay, total_reversals, held_batches, history,
  } = state;

  const pct = (v) => ((v - min) / (max - min)) * 100;
  const formatRate = (rate) => (rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`);
  const changedFromDefault = contamination !== default_contamination;

  return (
    <Screen title="Adaptive Sensitivity Monitor" subtitle={subtitle}>
      <ErrorBanner message={error} />

      <div className="metric-row">
        <div className="metric">
          <div className="metric-value">{(contamination * 100).toFixed(1)}%</div>
          <div className="metric-label">Outlier sensitivity{changedFromDefault ? ' (adjusted)' : ' (default)'}</div>
        </div>
        <div className="metric">
          <div className="metric-value">{total_outlier_decisions}</div>
          <div className="metric-label">Outlier decisions recorded</div>
        </div>
        <div className="metric">
          <div className="metric-value">{accepted_outlier_decisions}</div>
          <div className="metric-label">Accepted</div>
        </div>
        <div className="metric">
          <div className="metric-value">{rejected_outlier_decisions}</div>
          <div className="metric-label">Rejected</div>
        </div>
        <div className="metric">
          <div className="metric-value">{formatRate(accept_rate)}</div>
          <div className="metric-label">Accept rate (all time)</div>
        </div>
        <div className="metric">
          <div className="metric-value">{formatRate(recent_accept_rate)}</div>
          <div className="metric-label">Recent accept rate</div>
        </div>
      </div>

      <div className="panel">
        <p className="panel-title">Outlier sensitivity (contamination)</p>
        <p className="panel-hint">
          Once {batch_size} new outlier decisions come in, the sensitivity is nudged up if you
          mostly accept flagged outliers and down if you mostly reject them, within a fixed safe
          range. Recent decisions count more than old ones.
        </p>

        <div className="gauge">
          <div className="gauge-track">
            <div className="gauge-fill" style={{ width: `${pct(contamination)}%` }} />
            <div className="gauge-default" style={{ left: `${pct(default_contamination)}%` }} title="Default" />
            <div className="gauge-knob" style={{ left: `${pct(contamination)}%` }} />
          </div>
          <div className="gauge-scale">
            <span>{min.toFixed(2)}</span>
            <span>default {default_contamination.toFixed(2)}</span>
            <span>{max.toFixed(2)}</span>
          </div>
        </div>

        {decisions_since_last_adjustment > 0 && (
          <p className="panel-hint" style={{ marginTop: 14, marginBottom: 0 }}>
            {decisions_since_last_adjustment} of {batch_size} decisions logged toward the next
            re-evaluation.
          </p>
        )}
      </div>

      <div className="panel">
        <p className="panel-title">Loop settings</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Re-evaluate after every</td><td>{batch_size} outlier decisions</td></tr>
              <tr><td>Adjustment step</td><td>{step.toFixed(3)}</td></tr>
              <tr><td>Allowed range</td><td>{min.toFixed(2)} – {max.toFixed(2)}</td></tr>
              <tr><td>Default</td><td>{default_contamination.toFixed(2)}</td></tr>
              <tr><td>Raise sensitivity at accept rate ≥</td><td>{formatRate(accept_threshold)}</td></tr>
              <tr><td>Lower sensitivity at accept rate ≤</td><td>{formatRate(reject_threshold)}</td></tr>
              <tr><td>Weight kept by each earlier decision</td><td>{decay}</td></tr>
              <tr><td>Reversed decisions seen</td><td>{total_reversals}</td></tr>
              <tr><td>Batches held back (too many reversals)</td><td>{held_batches}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <p className="panel-title">Adjustment history</p>
        {history.length === 0 ? (
          <p className="panel-hint" style={{ margin: 0 }}>
            No adjustments yet. Accept or reject some outliers on the{' '}
            <a href={hrefFor('app/review')}>Review</a> screen first.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h, i) => (
                  <tr key={i}>
                    <td>{h.from.toFixed(3)}</td>
                    <td style={{ color: h.to > h.from ? 'var(--status-good)' : 'var(--status-warning)' }}>
                      {h.to.toFixed(3)}
                    </td>
                    <td className="cell-prose" style={{ whiteSpace: 'normal', minWidth: 280 }}>{h.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <p className="panel-title">Reset</p>
        <p className="panel-hint">
          Put the sensitivity back to its default and clear the history. A batch in which you
          reverse earlier decisions on the same cell is held instead of applied, and a
          consistently biased reviewer is not detected.
        </p>
        <button className="btn btn-ghost" type="button" onClick={handleReset} disabled={isResetting}>
          {isResetting ? 'Resetting…' : 'Reset sensitivity'}
        </button>
      </div>
    </Screen>
  );
}
