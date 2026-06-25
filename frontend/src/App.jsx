import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './hooks/useAuthStore';
import NavBar from './components/shared/NavBar';
import LoginPage from './pages/LoginPage';
import CoachDashboard from './pages/CoachDashboard';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import BatchDetailPage from './pages/BatchDetailPage';
import SocialFeed from './components/SocialFeed';
import MessagingPage from './pages/MessagingPage';
import CalendarPage from './pages/CalendarPage';
import SearchPage from './pages/SearchPage';
import ProfilePage from './pages/ProfilePage';
import EventsPage from './pages/EventsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProgressPage from './pages/ProgressPage';
import NotificationsPage from './pages/NotificationsPage';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2,
      refetchOnWindowFocus: false,
    },
  },
});

const AppLayout = ({ allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    const roleRoutes = { admin: '/admin', coach: '/coach', student: '/feed' };
    return <Navigate to={roleRoutes[user?.role] || '/login'} replace />;
  }
  return (
    <div className="app-layout">
      <NavBar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

const RootRedirect = () => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Navigate to="/feed" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootRedirect />} />

        {/* All authenticated users */}
        <Route element={<AppLayout allowedRoles={['student', 'coach', 'admin']} />}>
          <Route path="/feed"       element={<SocialFeed />} />
          <Route path="/messaging"  element={<MessagingPage />} />
          <Route path="/calendar"   element={<CalendarPage />} />
          <Route path="/search"     element={<SearchPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/events"    element={<EventsPage />} />
          <Route path="/progress"  element={<ProgressPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile"    element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          {/* Legacy social redirect */}
          <Route path="/social"     element={<Navigate to="/feed" replace />} />
        </Route>

        {/* Coach + Admin */}
        <Route element={<AppLayout allowedRoles={['coach', 'admin']} />}>
          <Route path="/coach" element={<CoachDashboard />} />
          <Route path="/coach/batches/:batchId" element={<BatchDetailPage />} />
        </Route>

        {/* Student */}
        <Route element={<AppLayout allowedRoles={['student', 'coach', 'admin']} />}>
          <Route path="/student" element={<StudentDashboard />} />
        </Route>

        {/* Admin */}
        <Route element={<AppLayout allowedRoles={['admin']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>

    <Toaster
      position="bottom-center"
      toastOptions={{
        duration: 3500,
        style: {
          background: 'var(--surface-2)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-light)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        },
        success: { iconTheme: { primary: '#fff', secondary: '#000' } },
        error: { iconTheme: { primary: '#ff6b6b', secondary: '#000' } },
      }}
    />
  </QueryClientProvider>
);

export default App;
