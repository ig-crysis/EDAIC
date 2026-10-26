import { hrefFor } from '../router';
import { LOGO_SRC, SITE_NAV, DASH_NAV } from '../nav';

function NavLinks({ items, route }) {
  return items.map((item) => (
    <a key={item.route} href={hrefFor(item.route)} className={item.route === route ? 'is-active' : ''}>
      {item.label}
    </a>
  ));
}

function Brand({ label }) {
  return (
    <a className="app-brand" href={hrefFor('home')} aria-label={label}>
      <span className="app-logo">
        <img src={LOGO_SRC} alt="" width="40" height="40" />
      </span>
      <span className="app-brand-text">
        <span className="app-brand-title">Explainable AI Data Cleaning</span>
        <span className="app-brand-sub">Adaptive Data Quality Intelligence</span>
      </span>
    </a>
  );
}

export default function AppHeader({ route }) {
  // Two header modes, as on ADQI: the site header (Home / Pipeline /
  // Explainability / Dashboard) and the dashboard header (Upload / Profile /
  // Review / Admin / Export with a way back to the overview). Both use the
  // original EDAIC floating pill.
  if (route.startsWith('app/')) {
    return (
      <header className="app-header">
        <Brand label="EDAIC — back to the landing page" />
        <nav className="app-nav" aria-label="Dashboard">
          <NavLinks items={DASH_NAV} route={route} />
        </nav>
        <a className="home-link" href={hrefFor('home')}>
          &larr; Overview
        </a>
      </header>
    );
  }

  return (
    <header className="app-header">
      <Brand label="EDAIC home" />
      <nav className="app-nav" aria-label="Primary">
        <NavLinks items={SITE_NAV} route={route} />
      </nav>
      <a className="home-link" href={hrefFor('app/admin')}>
        Admin
      </a>
    </header>
  );
}
