import { useState, useCallback } from 'react';
import { Activity, Download, RotateCcw, AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import FileUpload from './components/FileUpload';
import DataQualityScore from './components/DataQualityScore';
import ChartsPanel from './components/ChartsPanel';
import IssueList from './components/IssueList';
import BeforeAfterComparison from './components/BeforeAfterComparison';
import StageTracker from './components/StageTracker';
import DataPreviewTable from './components/DataPreviewTable';
import HowItWorks from './components/HowItWorks';
import PipelineDetail from './components/PipelineDetail';
import Hero from './components/Hero';
import ColumnProfileTable from './components/ColumnProfileTable';
import AdaptiveLoopPanel from './components/AdaptiveLoopPanel';
import { uploadDataset, analyzeDataset, getDashboard, applyCleaning, downloadUrl, extractErrorMessage, getAdaptiveState, resetAdaptiveState } from './api/client';
import { downloadIssueReport } from './utils/exportReport';

const STAGES = { UPLOAD: 'upload', ANALYZED: 'analyzed', CLEANED: 'cleaned' };

export default function App() {
  const [stage, setStage] = useState(STAGES.UPLOAD);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(null);

  const [dataset, setDataset] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [cleaningResult, setCleaningResult] = useState(null);
  // Snapshot of `decisions` at the moment cleaning last actually ran, so
  // we can tell when the person has changed their mind (accepted/rejected
  // something new) AFTER cleaning already happened — that's exactly when
  // the current cleaned download is now stale and a re-apply is needed.
  const [lastAppliedDecisions, setLastAppliedDecisions] = useState(null);
  const [adaptiveState, setAdaptiveState] = useState(null);
  const [isResettingAdaptive, setIsResettingAdaptive] = useState(false);

  const refreshAdaptiveState = useCallback(async () => {
    try {
      const res = await getAdaptiveState();
      setAdaptiveState(res);
    } catch {
      // Non-critical panel — a failed fetch here shouldn't block the rest of the app.
    }
  }, []);

  const handleResetAdaptive = useCallback(async () => {
    setIsResettingAdaptive(true);
    try {
      const res = await resetAdaptiveState();
      setAdaptiveState(res);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsResettingAdaptive(false);
    }
  }, []);

  const reset = () => {
    setStage(STAGES.UPLOAD);
    setDataset(null);
    setAnalysis(null);
    setDashboard(null);
    setDecisions({});
    setCleaningResult(null);
    setLastAppliedDecisions(null);
    setError(null);
  };

  const handleFileSelected = useCallback(async (file) => {
    setError(null);
    setIsBusy(true);
    try {
      const uploadRes = await uploadDataset(file);
      setDataset(uploadRes);

      const analyzeRes = await analyzeDataset(uploadRes.dataset_id);
      setAnalysis(analyzeRes);

      const dashRes = await getDashboard(uploadRes.dataset_id);
      setDashboard(dashRes);

      setStage(STAGES.ANALYZED);
      refreshAdaptiveState();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }, [refreshAdaptiveState]);

  const handleDecide = useCallback((issueId, decision) => {
    setDecisions((prev) => ({ ...prev, [issueId]: decision }));
  }, []);

  const handleBulkDecide = useCallback((issueIds, decision) => {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of issueIds) next[id] = decision;
      return next;
    });
  }, []);

  const handleDownloadReport = useCallback(() => {
    if (!analysis || !dataset) return;
    downloadIssueReport(dataset.filename, analysis.issues, decisions);
  }, [analysis, dataset, decisions]);

  const handleApplyCleaning = useCallback(async () => {
    if (!dataset) return;
    setError(null);
    setIsBusy(true);
    try {
      const rejected = Object.entries(decisions).filter(([, v]) => v === 'rejected').map(([k]) => k);
      const res = await applyCleaning(dataset.dataset_id, { rejectedIssueIds: rejected });
      setCleaningResult(res);
      setLastAppliedDecisions(decisions);
      setStage(STAGES.CLEANED);
      refreshAdaptiveState();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }, [dataset, decisions, refreshAdaptiveState]);

  const currentStep = stage === STAGES.UPLOAD ? (isBusy ? 1 : 0) : stage === STAGES.ANALYZED ? 2 : 4;

  // True once cleaning has run at least once AND the person has since
  // accepted/rejected something new — meaning the downloaded file no
  // longer reflects their current decisions until they re-apply.
  const decisionsChangedSinceClean = stage === STAGES.CLEANED
    && lastAppliedDecisions !== null
    && JSON.stringify(decisions) !== JSON.stringify(lastAppliedDecisions);

  return (
    <div className="min-h-screen text-[var(--color-text)]">
      <header className="slide-down sticky top-0 z-10 px-4 pt-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6 rounded-full border border-[var(--color-border)] bg-black/70 backdrop-blur-xl px-4 py-2.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center">
              <Activity size={17} className="text-[#0a0b10]" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-display font-semibold text-sm leading-tight">Explainable AI Data Cleaning</h1>
              <p className="text-xs text-[var(--color-text-muted)]">Adaptive Data Quality Intelligence</p>
            </div>
          </div>

          <StageTracker currentStep={currentStep} />

          {stage !== STAGES.UPLOAD ? (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-sm font-display font-medium text-white bg-[var(--color-violet)]/20 hover:bg-[var(--color-violet)]/30 border border-[var(--color-violet)]/40 rounded-full px-4 py-2 transition shrink-0"
            >
              <RotateCcw size={14} /> <span className="hidden sm:inline">Start over</span>
            </button>
          ) : (
            <span className="hidden sm:flex items-center text-xs font-display font-medium text-white bg-white/10 border border-white/15 rounded-full px-4 py-2 shrink-0">
              Beta
            </span>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {error && (
          <div className="flex items-start gap-3 bg-[var(--color-coral-soft)] border border-[var(--color-coral)]/30 text-[var(--color-coral)] rounded-xl px-4 py-3 animate-fade-up">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {stage === STAGES.UPLOAD && (
          <div className="max-w-2xl mx-auto animate-fade-up">
            <Hero />
            <FileUpload onFileSelected={handleFileSelected} isUploading={isBusy} />
          </div>
        )}

        {(stage === STAGES.ANALYZED || stage === STAGES.CLEANED) && analysis && (
          <div className="space-y-8">
            <div className="reveal flex flex-wrap items-center justify-between gap-3" style={{ '--d': '0.04s' }}>
              <div>
                <h2 className="font-display text-lg font-semibold">{dataset.filename}</h2>
                <p className="text-sm text-[var(--color-text-muted)] mono">
                  {analysis.n_rows} rows · {analysis.n_columns} columns · {analysis.issues.length} issues found
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadReport}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-violet)]/50 transition text-sm font-display"
                  title="Download a CSV of every detected issue, its explanation, and your accept/reject decisions"
                >
                  <FileText size={15} /> <span className="hidden sm:inline">Issue report</span>
                </button>
                {stage === STAGES.ANALYZED && (
                  <button
                    onClick={handleApplyCleaning}
                    disabled={isBusy}
                    className="cta-glow px-5 py-2.5 rounded-xl bg-[var(--color-teal)] text-[#06110d] font-display font-semibold text-sm hover:brightness-110 transition disabled:opacity-50"
                    style={{ '--d': '0.3s' }}
                  >
                    {isBusy ? 'Applying…' : 'Apply cleaning'}
                  </button>
                )}
                {stage === STAGES.CLEANED && (
                  <>
                    {decisionsChangedSinceClean && (
                      <button
                        onClick={handleApplyCleaning}
                        disabled={isBusy}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-violet)] text-white font-display font-semibold text-sm hover:brightness-110 transition disabled:opacity-50"
                        title="Your accept/reject decisions have changed since cleaning last ran — re-apply to update the cleaned file"
                      >
                        <RotateCcw size={15} /> {isBusy ? 'Re-applying…' : 'Re-apply cleaning'}
                      </button>
                    )}
                    <a
                      href={downloadUrl(dataset.dataset_id)}
                      className="cta-glow flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-teal)] text-[#06110d] font-display font-semibold text-sm hover:brightness-110 transition"
                      style={{ '--d': '0.3s' }}
                    >
                      <Download size={16} /> Download cleaned dataset
                    </a>
                  </>
                )}
              </div>
            </div>

            <div className="reveal" style={{ '--d': '0.1s' }}>
              <DataQualityScore score={stage === STAGES.CLEANED ? cleaningResult.after_score : analysis.quality_score} />
            </div>

            <div className="reveal" style={{ '--d': '0.16s' }}>
              <ColumnProfileTable columns={analysis.columns} />
            </div>

            <div className="reveal" style={{ '--d': '0.22s' }}>
              <DataPreviewTable datasetId={dataset.dataset_id} hasCleanedVersion={stage === STAGES.CLEANED} />
            </div>

            {stage === STAGES.CLEANED && cleaningResult && (
              <div className="reveal" style={{ '--d': '0.1s' }}>
                <BeforeAfterComparison
                  before={cleaningResult.before_score}
                  after={cleaningResult.after_score}
                  nChanges={cleaningResult.n_changes_applied}
                />
              </div>
            )}

            <div className="reveal" style={{ '--d': '0.28s' }}>
              <ChartsPanel dashboard={dashboard} />
            </div>

            <div className="reveal" style={{ '--d': '0.34s' }}>
              <HowItWorks />
            </div>

            <div className="reveal" style={{ '--d': '0.4s' }}>
              <PipelineDetail />
            </div>

            <div className="reveal" style={{ '--d': '0.46s' }}>
              <AdaptiveLoopPanel state={adaptiveState} onReset={handleResetAdaptive} isResetting={isResettingAdaptive} />
            </div>

            <div className="reveal" style={{ '--d': '0.52s' }}>
              <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
                Detected issues
                {stage === STAGES.ANALYZED && (
                  <span className="text-xs font-normal font-body text-[var(--color-text-muted)]">
                    (review and accept/reject below, or apply all defaults)
                  </span>
                )}
                {stage === STAGES.CLEANED && (
                  <span className="text-xs font-normal font-body text-[var(--color-text-muted)]">
                    (you can still change decisions here — re-apply cleaning above to update the download)
                  </span>
                )}
              </h3>
              <IssueList issues={analysis.issues} decisions={decisions} onDecide={handleDecide} onBulkDecide={handleBulkDecide} />
            </div>

            {stage === STAGES.CLEANED && decisionsChangedSinceClean && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-amber)] justify-center pt-2">
                <AlertCircle size={16} /> You've changed a decision since cleaning ran — click "Re-apply cleaning" above to update the download.
              </div>
            )}
            {stage === STAGES.CLEANED && !decisionsChangedSinceClean && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-teal)] justify-center pt-2">
                <CheckCircle2 size={16} /> Cleaning complete. Your dataset is ready to download.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
