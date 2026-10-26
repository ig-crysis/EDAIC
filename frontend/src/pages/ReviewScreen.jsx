import { hrefFor } from '../router';
import Screen, { NoDataset, ErrorBanner } from '../components/Screen';
import IssueList from '../components/IssueList';

export default function ReviewScreen({ session }) {
  const {
    analysis, decisions, isBusy, isCleaned, error, decisionsChangedSinceClean,
    handleDecide, handleBulkDecide, handleApplyCleaning, handleDownloadReport,
  } = session;

  const subtitle =
    'Nothing is changed until you apply. Accept or reject each suggestion — any you do not reject are applied by default.';

  if (!analysis) {
    return (
      <Screen title="Review Suggested Fixes" subtitle={subtitle}>
        <NoDataset />
      </Screen>
    );
  }

  const issues = analysis.issues;
  const accepted = issues.filter((i) => decisions[i.issue_id] === 'accepted').length;
  const rejected = issues.filter((i) => decisions[i.issue_id] === 'rejected').length;

  return (
    <Screen title="Review Suggested Fixes" subtitle={subtitle}>
      <ErrorBanner message={error} />

      <div className="metric-row">
        <div className="metric">
          <div className="metric-value">{issues.length}</div>
          <div className="metric-label">Issues found</div>
        </div>
        <div className="metric">
          <div className="metric-value">{accepted}</div>
          <div className="metric-label">Accepted</div>
        </div>
        <div className="metric">
          <div className="metric-value">{rejected}</div>
          <div className="metric-label">Rejected (left as-is)</div>
        </div>
        <div className="metric">
          <div className="metric-value">{issues.length - accepted - rejected}</div>
          <div className="metric-label">Not yet reviewed</div>
        </div>
      </div>

      {decisionsChangedSinceClean && (
        <div className="banner banner-warning">
          You have changed a decision since cleaning ran — re-apply cleaning to update the
          cleaned file.
        </div>
      )}
      {isCleaned && !decisionsChangedSinceClean && (
        <div className="banner banner-info">
          Cleaning complete. Open <a href={hrefFor('app/export')}>Export</a> to download the
          cleaned dataset.
        </div>
      )}

      <div className="panel">
        <p className="panel-title">Apply cleaning</p>
        <p className="panel-hint">
          Applies every suggestion you have not rejected to a working copy of the dataset. The
          original upload is never touched.
        </p>
        <div className="toolbar">
          {(!isCleaned || decisionsChangedSinceClean) && (
            <button className="btn btn-primary" type="button" onClick={handleApplyCleaning} disabled={isBusy}>
              {isBusy
                ? (isCleaned ? 'Re-applying…' : 'Applying…')
                : (isCleaned ? 'Re-apply cleaning' : 'Apply cleaning')}
            </button>
          )}
          {isCleaned && (
            <a className="btn btn-primary" href={hrefFor('app/export')}>
              Go to Export
            </a>
          )}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={handleDownloadReport}
            title="Download a CSV of every detected issue, its explanation, and your accept/reject decisions"
          >
            Issue report
          </button>
          {isBusy && <span className="spinner" aria-hidden="true" />}
        </div>
      </div>

      <div className="panel">
        <p className="panel-title">Detected issues</p>
        <p className="panel-hint">
          Expand a suggestion to read why it was flagged, then accept or reject it. Decisions on
          outliers also tune the detector's sensitivity.
        </p>
        {issues.length === 0 ? (
          <p className="panel-hint" style={{ margin: 0 }}>
            No issues were detected, so there is nothing to review.
          </p>
        ) : (
          <IssueList
            issues={issues}
            decisions={decisions}
            onDecide={handleDecide}
            onBulkDecide={handleBulkDecide}
          />
        )}
      </div>
    </Screen>
  );
}
