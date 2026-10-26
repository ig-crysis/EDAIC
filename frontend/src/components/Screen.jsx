import { hrefFor } from '../router';
import SkipLink from './SkipLink';

// Page frame shared by every dashboard screen: title, subtitle, content.
export default function Screen({ title, subtitle, centered = false, children }) {
  return (
    <>
      <SkipLink />
      <main className={`app-main${centered ? ' screen-centered' : ''}`} id="main" tabIndex={-1}>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {children}
      </main>
    </>
  );
}

// Shown on every screen that needs a dataset, instead of disabling the header.
export function NoDataset() {
  return (
    <div className="state-message">
      No dataset loaded yet. Open <a href={hrefFor('app/upload')}>Upload</a> first.
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return <div className="banner banner-error" role="alert">{message}</div>;
}
