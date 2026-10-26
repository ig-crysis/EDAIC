import { hrefFor } from '../router';
import Screen, { ErrorBanner } from '../components/Screen';
import DropZone from '../components/DropZone';
import DataPreviewTable from '../components/DataPreviewTable';

export default function UploadScreen({ session }) {
  const { analysis, dataset, isBusy, error, handleFileSelected, handleLoadSample } = session;
  const hasDataset = !!analysis;

  return (
    <Screen
      centered={!hasDataset}
      title="Upload / Connect"
      subtitle="Drop a CSV or Excel file into the box below, or try the bundled sample dataset (15 rows, known issues)."
    >
      <ErrorBanner message={error} />

      <div className="upload-wrap">
        <DropZone onFileSelected={handleFileSelected} isUploading={isBusy} compact={hasDataset} />

        <div className="upload-actions">
          <span>or</span>
          <button className="btn btn-ghost" type="button" onClick={handleLoadSample} disabled={isBusy}>
            Load sample dataset
          </button>
        </div>
      </div>

      {isBusy && (
        <div className="state-message">
          The first run after the backend starts can take a minute while the ML libraries load.
        </div>
      )}

      {!isBusy && hasDataset && (
        <div>
          <div className="banner banner-info">
            Loaded {dataset.filename} — {analysis.n_rows} rows, {analysis.n_columns} columns.
          </div>

          <div className="panel">
            <p className="panel-title">Column types inferred</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Inferred type</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.columns.map((col) => (
                    <tr key={col.name}>
                      <td>{col.name}</td>
                      <td>{col.dtype}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DataPreviewTable datasetId={dataset.dataset_id} hasCleanedVersion={false} title="Preview" />

          <div className="banner banner-info">
            Found <strong>{analysis.issues.length}</strong> flagged issues. Open{' '}
            <a href={hrefFor('app/profile')}>Quality Profile</a> or{' '}
            <a href={hrefFor('app/review')}>Review</a> to continue.
          </div>
        </div>
      )}
    </Screen>
  );
}
