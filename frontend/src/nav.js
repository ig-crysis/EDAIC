export const LOGO_SRC = `${import.meta.env.BASE_URL}assets/logo.webp`;

// Site-level navigation: the landing page and the two long-form explainer
// pages. "Dashboard" opens the working screens.
export const SITE_NAV = [
  { route: 'home', label: 'Home' },
  { route: 'pipeline', label: 'Pipeline' },
  { route: 'explainability', label: 'Explainability' },
  { route: 'app/upload', label: 'Dashboard' },
];

// Dashboard navigation (ADQI's Upload / Profile / Review / Admin / Export,
// minus its LLM "AI Insights" screen, which this project has no equivalent of).
// Every item is always a live link -- screens that need a dataset explain
// that themselves instead of the header being disabled.
export const DASH_NAV = [
  { route: 'app/upload', label: 'Upload' },
  { route: 'app/profile', label: 'Profile' },
  { route: 'app/review', label: 'Review' },
  { route: 'app/admin', label: 'Admin' },
  { route: 'app/export', label: 'Export' },
];
