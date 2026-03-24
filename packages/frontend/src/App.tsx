import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth-store';
import { AuthPage } from './components/auth/AuthPage';
import { ProjectList } from './components/projects/ProjectList';
import { EditorLayout } from './components/layout/EditorLayout';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { OrganizationList } from './components/admin/OrganizationList';
import { LicenseList } from './components/admin/LicenseList';
import { PlanManager } from './components/admin/PlanManager';
import { UsageAnalytics } from './components/admin/UsageAnalytics';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
          <span className="text-xl">🗺</span>
        </div>
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

function App() {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:id" element={<EditorLayout />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="organizations" element={<OrganizationList />} />
          <Route path="licenses" element={<LicenseList />} />
          <Route path="plans" element={<PlanManager />} />
          <Route path="usage" element={<UsageAnalytics />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
