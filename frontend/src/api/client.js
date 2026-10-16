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
  return err?.response?.data?.detail || err?.message || 'Something went wrong. Please try again.';
}
