import { useEffect, useState } from 'react';

// Hash routing keeps this a plain static site (Netlify / nginx need no
// rewrite rules) while every header link is a real, always-clickable <a>.
export const ROUTES = [
  'home',
  'pipeline',
  'explainability',
  'app/upload',
  'app/profile',
  'app/review',
  'app/export',
  'app/admin',
];

export function hrefFor(route) {
  return route === 'home' ? '#/' : `#/${route}`;
}

function parseRoute() {
  const path = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return ROUTES.includes(path) ? path : 'home';
}

export function useRoute() {
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
