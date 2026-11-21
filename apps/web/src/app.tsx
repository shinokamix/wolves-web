import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { SessionProvider, useSession } from '@/api/session';
import Navbar from '@/components/Navbar';
import AuthForm from '@/components/auth-form';
import NewLocation from '@/components/new-location';
import { PageState } from '@/components/page-state';
import { appBase } from '@/lib/navigation';
import Home from '@/pages/home';
import Trips from '@/pages/trips';
import Trip from '@/pages/trip';
import NewTrip from '@/pages/new-trip';
import SharedTrip from '@/pages/shared-trip';
import PrintTrip from '@/pages/print-trip';
import './generated/styles.css';

const Globe = lazy(() => import('@/pages/globe'));
function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading, error, reload } = useSession();
  if (loading || error) return <PageState loading={loading} error={error} retry={reload} />;
  return session ? <>{children}</> : <Navigate to="/login" replace />;
}
function LocationForm() {
  const { tripId } = useParams();
  return <NewLocation tripId={tripId!} />;
}
function Shell() {
  const { session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  useEffect(() => {
    const onNavigate = (event: Event) => {
      setError('');
      navigate((event as CustomEvent<string>).detail);
    };
    const onError = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener('travel:navigate', onNavigate);
    window.addEventListener('travel:error', onError);
    return () => {
      window.removeEventListener('travel:navigate', onNavigate);
      window.removeEventListener('travel:error', onError);
    };
  }, [navigate]);
  useEffect(() => {
    document.title = 'AI Travel Planner';
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <>
      <div className="no-print">
        <Navbar session={session} />
      </div>
      {error && (
        <div
          role="alert"
          className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-xl bg-red-50 p-4 text-red-700"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      <Suspense fallback={<PageState loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/register" element={<AuthForm mode="register" />} />
          <Route
            path="/trips"
            element={
              <Protected>
                <Trips />
              </Protected>
            }
          />
          <Route
            path="/trips/new"
            element={
              <Protected>
                <NewTrip />
              </Protected>
            }
          />
          <Route
            path="/trips/:tripId"
            element={
              <Protected>
                <Trip />
              </Protected>
            }
          />
          <Route
            path="/trips/:tripId/itinerary/new"
            element={
              <Protected>
                <LocationForm />
              </Protected>
            }
          />
          <Route
            path="/trips/:tripId/print"
            element={
              <Protected>
                <PrintTrip />
              </Protected>
            }
          />
          <Route path="/shared/:tripId" element={<SharedTrip />} />
          <Route
            path="/globe"
            element={
              <Protected>
                <Globe />
              </Protected>
            }
          />
          <Route path="*" element={<PageState error="Page not found." />} />
        </Routes>
      </Suspense>
    </>
  );
}
export default function App() {
  return (
    <BrowserRouter basename={appBase()}>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </BrowserRouter>
  );
}
