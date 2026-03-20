import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

const navItems = [
  { to: '/admin',              label: 'Dashboard',      icon: '📊', end: true },
  { to: '/admin/organizations', label: 'Organisations',  icon: '🏢' },
  { to: '/admin/plans',        label: 'Plans',           icon: '💳' },
  { to: '/admin/licenses',     label: 'Licences',        icon: '🔑' },
  { to: '/admin/usage',        label: 'Usage',           icon: '📈' },
];

export function AdminLayout() {
  const { signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-sm">🗺</div>
            <div>
              <div className="text-sm font-semibold text-white">Kàggu</div>
              <div className="text-xs text-slate-400">Admin</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-2 py-4 border-t border-slate-800 space-y-0.5">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <span>←</span>
            <span>Retour éditeur</span>
          </NavLink>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
          >
            <span>🚪</span>
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
