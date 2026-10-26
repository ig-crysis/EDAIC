import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE,
  // 3 minutes: the very first analysis after the backend starts can be
  // slow because Python is loading ML libraries (scikit-learn, SHAP) into
  // memory for the first time. Every request after that is much faster.
  timeout: 180000,
});

export async function uploadDataset(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/api/datasets/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function analyzeDataset(datasetId) {
  const { data } = await api.post(`/api/datasets/${datasetId}/analyze`);
  return data;
}

export async function getDashboard(datasetId) {
  const { data } = await api.get(`/api/datasets/${datasetId}/dashboard`);
  return data;
}

export async function getPreview(datasetId, { rows = 10, cleaned = false, start = 0 } = {}) {
  const { data } = await api.get(`/api/datasets/${datasetId}/preview`, {
    params: { rows, cleaned, start },
  });
  return data;
}

export async function applyCleaning(datasetId, { acceptedIssueIds, rejectedIssueIds } = {}) {
  const { data } = await api.post(`/api/datasets/${datasetId}/clean`, {
    dataset_id: datasetId,
    accepted_issue_ids: acceptedIssueIds ?? null,
    rejected_issue_ids: rejectedIssueIds ?? null,
  });
  return data;
}

export function downloadUrl(datasetId) {
  return `${API_BASE}/api/datasets/${datasetId}/download`;
}

export async function getAdaptiveState() {
  const { data } = await api.get('/api/adaptive/state');
  return data;
}

export async function resetAdaptiveState() {
  const { data } = await api.post('/api/adaptive/reset');
  return data;
}

export function extractErrorMessage(err) {
  // The request was sent but the server took longer than the client limit.
  // That is NOT "unreachable" -- the backend is up and probably still working.
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
    return 'The analysis is taking longer than the 3-minute limit. Very large or wide files can be slow on the free hosted backend — try a smaller sample of the file (for example the first 2,000 rows), or try again in a minute.';
  }
  // No response at all means the request never reached the API (backend not
  // running, wrong port, CORS) -- say so instead of axios's bare "Network Error".
  if (err?.request && !err.response) {
    return `Could not reach the backend at ${API_BASE}. Make sure it is running and that VITE_API_BASE_URL points to it.`;
  }
  return err?.response?.data?.detail || err?.message || 'Something went wrong. Please try again.';
}
