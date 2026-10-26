import { hrefFor } from '../router';
import { downloadUrl } from '../api/client';
import Screen, { NoDataset } from '../components/Screen';
import BeforeAfterComparison from '../components/BeforeAfterComparison';
import DataPreviewTable from '../components/DataPreviewTable';

const SUBTITLE =
  'Applies every suggestion you have not rejected to a working copy of the dataset. The original upload is never touched.';

export default function ExportScreen({ session }) {
  const { analysis, dataset, isCleaned, cleaningResult, decisionsChangedSinceClean, handleDownloadReport } = session;

  if (!analysis) {
    return (
      <Screen title="Export" subtitle={SUBTITLE}>
        <NoDataset />
      </Screen>
    );
  }

  if (!isCleaned) {
    return (
      <Screen title="Export" subtitle={SUBTITLE}>
        <div className="banner banner-info">
          Cleaning has not been applied yet — an export now would be identical to the original
          upload. Review the suggestions in <a href={hrefFor('app/review')}>Review</a> and click
          Apply cleaning first.
        </div>
        <div className="panel">
          <p className="panel-title">Issue report</p>
          <p className="panel-hint">
            A CSV of every detected issue, its explanation and your accept/reject decisions. It is
            available at any time.
          </p>
          <button className="btn btn-ghost" type="button" onClick={handleDownloadReport}>
            Download issue report
          </button>
        </div>
      </Screen>
    );
  }

  const { before_score: before, after_score: after, n_changes_applied: nChanges } = cleaningResult;
  const improvement = after.overall_score - before.overall_score;

  return (
    <Screen title="Export" subtitle={SUBTITLE}>
      <div className="metric-row">
        <div className="metric">
          <div className="metric-value">{nChanges}</div>
          <div className="metric-label">Changes applied</div>
        </div>
        <div className="metric">
          <div className="metric-value">{before.overall_score.toFixed(0)}</div>
          <div className="metric-label">Quality score before</div>
        </div>
        <div className="metric">
          <div className="metric-value">{after.overall_score.toFixed(0)}</div>
          <div className="metric-label">Quality score after</div>
        </div>
        <div className="metric">
          <div className="metric-value" style={{ color: improvement > 0 ? 'var(--status-good)' : undefined }}>
            {improvement > 0 ? '+' : ''}{improvement.toFixed(1)}
          </div>
          <div className="metric-label">Improvement</div>
        </div>
      </div>

      {decisionsChangedSinceClean && (
        <div className="banner banner-warning">
          You have changed a decision since cleaning ran, so this file is out of date. Open{' '}
          <a href={hrefFor('app/review')}>Review</a> and re-apply cleaning to update it.
        </div>
      )}

      <div className="panel">
        <p className="panel-title">Cleaned dataset</p>
        <p className="panel-hint">{dataset.filename} with the applied fixes, as CSV.</p>
        <div className="toolbar">
          <a className="btn btn-primary" href={downloadUrl(dataset.dataset_id)}>
            Download cleaned dataset (CSV)
          </a>
          <button className="btn btn-ghost" type="button" onClick={handleDownloadReport}>
            Issue report
          </button>
        </div>
      </div>

      <BeforeAfterComparison before={before} after={after} nChanges={nChanges} />

      <DataPreviewTable datasetId={dataset.dataset_id} hasCleanedVersion title="Original vs cleaned" />
    </Screen>
  );
}
