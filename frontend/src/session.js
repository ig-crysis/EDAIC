import { useCallback, useState } from 'react';
import {
  uploadDataset,
  analyzeDataset,
  getDashboard,
  applyCleaning,
  extractErrorMessage,
} from './api/client';
import { downloadIssueReport } from './utils/exportReport';
import { useToast } from './toastContext';

export const STAGES = { UPLOAD: 'upload', ANALYZED: 'analyzed', CLEANED: 'cleaned' };

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample/dirty_customers.csv`;

/**
 * Everything about the current dataset -- upload, analysis, accept/reject
 * decisions and cleaning result. It lives above the router, so moving between
 * the dashboard screens (or out to Pipeline / Explainability and back) never
 * loses the loaded dataset.
 */
export function useSession() {
  const toast = useToast();

  const [stage, setStage] = useState(STAGES.UPLOAD);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(null);

  const [dataset, setDataset] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [cleaningResult, setCleaningResult] = useState(null);
  // Snapshot of `decisions` when cleaning last actually ran, so we can tell
  // when the person changed their mind AFTER cleaning -- exactly when the
  // current cleaned download is stale and a re-apply is needed.
  const [lastAppliedDecisions, setLastAppliedDecisions] = useState(null);

  const clearSession = useCallback(() => {
    setStage(STAGES.UPLOAD);
    setDataset(null);
    setAnalysis(null);
    setDashboard(null);
    setDecisions({});
    setCleaningResult(null);
    setLastAppliedDecisions(null);
    setError(null);
  }, []);

  const handleFileSelected = useCallback(
    async (file) => {
      clearSession();
      setIsBusy(true);
      try {
        const uploadRes = await uploadDataset(file);
        const analyzeRes = await analyzeDataset(uploadRes.dataset_id);
        const dashRes = await getDashboard(uploadRes.dataset_id);
        setDataset(uploadRes);
        setAnalysis(analyzeRes);
        setDashboard(dashRes);
        setStage(STAGES.ANALYZED);
        toast(`Loaded ${uploadRes.filename}.`);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setIsBusy(false);
      }
    },
    [clearSession, toast]
  );

  const handleLoadSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error('The sample dataset could not be loaded.');
      const blob = await res.blob();
      await handleFileSelected(new File([blob], 'dirty_customers.csv', { type: 'text/csv' }));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [handleFileSelected]);

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
      const rejected = Object.entries(decisions)
        .filter(([, v]) => v === 'rejected')
        .map(([k]) => k);
      const res = await applyCleaning(dataset.dataset_id, { rejectedIssueIds: rejected });
      setCleaningResult(res);
      setLastAppliedDecisions(decisions);
      setStage(STAGES.CLEANED);
      toast(
        `Cleaning applied — ${res.n_changes_applied} change${res.n_changes_applied !== 1 ? 's' : ''} made.`
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }, [dataset, decisions, toast]);

  const isCleaned = stage === STAGES.CLEANED;

  // True once cleaning has run AND the person has since accepted/rejected
  // something new -- the downloaded file no longer reflects their decisions
  // until they re-apply.
  const decisionsChangedSinceClean =
    isCleaned &&
    lastAppliedDecisions !== null &&
    JSON.stringify(decisions) !== JSON.stringify(lastAppliedDecisions);

  return {
    stage,
    isBusy,
    isCleaned,
    error,
    dataset,
    analysis,
    dashboard,
    decisions,
    cleaningResult,
    decisionsChangedSinceClean,
    clearError: () => setError(null),
    handleFileSelected,
    handleLoadSample,
    handleDecide,
    handleBulkDecide,
    handleDownloadReport,
    handleApplyCleaning,
  };
}
