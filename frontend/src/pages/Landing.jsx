import { useEffect, useRef, useState } from 'react';
import { hrefFor } from '../router';
import { LOGO_SRC, SITE_NAV } from '../nav';

// Every number here maps to something real in the codebase (same rule ADQI's
// landing page follows -- no invented marketing stats):
//  8   detector groups   -> README "What it does" / services/cleaning.py
//  100 accept/reject     -> every issue can be individually accepted or rejected
//  4   quality dimensions-> services/quality_score.py
//  5   decisions         -> BATCH_SIZE in services/adaptive.py
const STATS = [
  { icon: 'fa-layer-group', target: 8, suffix: '', label: 'Detector Groups', delay: '0.5s' },
  { icon: 'fa-user-check', target: 100, suffix: '%', label: 'Fixes You Can Accept Or Reject', delay: '0.58s' },
  { icon: 'fa-chart-pie', target: 4, suffix: '', label: 'Quality Dimensions Scored', delay: '0.66s' },
  { icon: 'fa-gauge-high', target: 5, suffix: '', label: 'Decisions Per Sensitivity Update', delay: '0.74s' },
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Count-up that starts once the stat scrolls into view, with the same stagger
// and easing as ADQI's landing/main.js.
function StatValue({ target, suffix, index }) {
  const ref = useRef(null);
  // With reduced motion the final value is shown straight away, no count-up.
  const [text, setText] = useState(() => (prefersReducedMotion() ? target + suffix : '0'));

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return undefined;

    let timeoutId;
    let frameId;
    const duration = 1500 + index * 80;

    const run = () => {
      let start = null;
      const frame = (timestamp) => {
        if (start === null) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        setText(Math.round(target * easeOutCubic(progress)) + suffix);
        if (progress < 1) frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        timeoutId = setTimeout(run, 480 + index * 90);
      },
      { threshold: 0.25 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
      cancelAnimationFrame(frameId);
    };
  }, [target, suffix, index]);

  return (
    <span ref={ref} className="stat-value">
      {text}
    </span>
  );
}

export default function Landing({ route }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Mobile menu: lock scroll while open, close on Escape or when the
  // viewport grows past the mobile breakpoint.
  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen);
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    const onResize = () => window.innerWidth > 720 && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.classList.remove('menu-open');
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const focusMain = (e) => {
    e.preventDefault();
    document.getElementById('main-content')?.focus();
  };

  return (
    <div className="landing">
      <a className="skip-link" href="#main-content" onClick={focusMain}>
        Skip to content
      </a>

      <div className="page">
        <header className="header anim" style={{ '--d': '0s' }}>
          <a className="logo" href={hrefFor('home')} aria-label="EDAIC home">
            <img src={LOGO_SRC} alt="" width="52" height="52" />
          </a>

          <nav className="nav-pill" aria-label="Primary">
            {SITE_NAV.map((item) => (
              <a
                key={item.route}
                href={hrefFor(item.route)}
                className={`nav-link${item.route === route ? ' is-active' : ''}`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <a className="admin-pill" href={hrefFor('app/admin')}>
            Admin
          </a>

          <button
            className="burger"
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="burger-bar" />
            <span className="burger-bar" />
            <span className="burger-bar" />
          </button>
        </header>

        <main className="hero" id="main-content" tabIndex={-1}>
          <div className="trust-row anim" style={{ '--d': '0.05s' }}>
            <span className="trust-avatar" aria-hidden="true">
              <span className="trust-avatar-inner">
                <i className="fa-solid fa-layer-group" />
              </span>
            </span>
            <span className="trust-avatar" aria-hidden="true">
              <span className="trust-avatar-inner">
                <i className="fa-solid fa-wand-magic-sparkles" />
              </span>
            </span>
            <span className="trust-avatar" aria-hidden="true">
              <span className="trust-avatar-inner">
                <i className="fa-solid fa-shield-halved" />
              </span>
            </span>
            <span className="trust-pill">
              <span className="trust-dot" />
              SHAP-explained · reviewer-approved · self-adjusting
            </span>
          </div>

          <h1 className="headline anim" style={{ '--d': '0.08s' }}>
            <span className="headline-line" style={{ '--fd': '0.12s' }}>
              Data Cleaning
            </span>
            <span className="headline-line" style={{ '--fd': '0.3s' }}>
              That Shows Why
            </span>
          </h1>

          <p className="subhead anim" style={{ '--d': '0.28s' }}>
            Eight groups of detectors flag what is wrong with a dataset, SHAP explains the
            most unusual outliers, and nothing is applied without your review — while the outlier
            sensitivity adapts from your accept and reject decisions.
          </p>

          <a className="cta anim cta-reveal" style={{ '--d': '0.4s' }} href={hrefFor('app/upload')}>
            Launch Dashboard
          </a>
        </main>

        <footer className="stats" aria-label="EDAIC at a glance">
          {STATS.map((stat, index) => (
            <div key={stat.label} className="stat anim" style={{ '--d': stat.delay }}>
              <i className={`stat-icon fa-solid ${stat.icon}`} aria-hidden="true" />
              <StatValue target={stat.target} suffix={stat.suffix} index={index} />
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </footer>
      </div>

      {menuOpen && (
        <>
          <div className="overlay" id="menu-overlay" onClick={closeMenu} />
          <div className="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
            <nav aria-label="Mobile primary">
              {SITE_NAV.map((item, i) => (
                <a
                  key={item.route}
                  href={hrefFor(item.route)}
                  className={`mobile-link${item.route === route ? ' is-active' : ''}`}
                  style={{ '--ld': `${0.05 * (i + 1)}s` }}
                  onClick={closeMenu}
                >
                  {item.label}
                </a>
              ))}
              <a
                href={hrefFor('app/admin')}
                className="mobile-admin"
                style={{ '--ld': `${0.05 * (SITE_NAV.length + 1)}s` }}
                onClick={closeMenu}
              >
                Admin
              </a>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
