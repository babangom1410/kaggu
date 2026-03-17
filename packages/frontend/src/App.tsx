import { useEffect } from 'react';
import { useAuthStore } from './stores/auth-store';
import { AuthPage } from './components/auth/AuthPage';
import { EditorLayout } from './components/layout/EditorLayout';

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
  return <EditorLayout />;
}

export default App;
