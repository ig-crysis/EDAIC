import { useEffect, useLayoutEffect } from 'react';
import { useRoute } from './router';
import { ToastProvider } from './toast';
import { useSession } from './session';
import AppHeader from './components/AppHeader';
import Backdrop from './components/Backdrop';
import Landing from './pages/Landing';
import Pipeline from './pages/Pipeline';
import Explainability from './pages/Explainability';
import UploadScreen from './pages/UploadScreen';
import ProfileScreen from './pages/ProfileScreen';
import ReviewScreen from './pages/ReviewScreen';
import ExportScreen from './pages/ExportScreen';
import AdminScreen from './pages/AdminScreen';

const TITLES = {
  home: 'Explainable AI Data Cleaning',
  pipeline: 'The Cleaning Pipeline — EDAIC',
  explainability: 'Explainability — EDAIC',
  'app/upload': 'Upload — EDAIC',
  'app/profile': 'Quality Profile — EDAIC',
  'app/review': 'Review — EDAIC',
  'app/export': 'Export — EDAIC',
  'app/admin': 'Adaptive Sensitivity Monitor — EDAIC',
};

function backdropVariant(route) {
  if (route === 'home') return 'landing';
  if (route === 'pipeline' || route === 'explainability') return 'reading';
  return 'app';
}

function Shell() {
  const route = useRoute();
  // The dataset lives here, above the router, so it survives navigating
  // between screens -- every header link is always live.
  const session = useSession();
  const isLanding = route === 'home';

  // The landing page owns a fixed one-viewport body (see styles/site.css);
  // every other page scrolls normally.
  useLayoutEffect(() => {
    document.body.classList.toggle('is-landing', isLanding);
    return () => document.body.classList.remove('is-landing');
  }, [isLanding]);

  useEffect(() => {
    document.title = TITLES[route];
  }, [route]);

  return (
    <>
      {/* Mounted once, so the background video keeps playing across navigation */}
      <Backdrop variant={backdropVariant(route)} />

      {isLanding ? (
        <Landing route={route} />
      ) : (
        <>
          <AppHeader route={route} />
          {route === 'pipeline' && <Pipeline />}
          {route === 'explainability' && <Explainability />}
          {route === 'app/upload' && <UploadScreen session={session} />}
          {route === 'app/profile' && <ProfileScreen session={session} />}
          {route === 'app/review' && <ReviewScreen session={session} />}
          {route === 'app/export' && <ExportScreen session={session} />}
          {route === 'app/admin' && <AdminScreen />}
        </>
      )}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
