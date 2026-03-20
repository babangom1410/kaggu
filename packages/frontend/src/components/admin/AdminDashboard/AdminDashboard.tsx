import { useEffect } from 'react';
import { useAdminStore } from '@/stores/admin-store';
import { KpiCard } from './KpiCard';
import { UsageChart } from './UsageChart';
import { RecentActivity } from './RecentActivity';

export function AdminDashboard() {
  const { dashboard, loading, error, fetchDashboard } = useAdminStore();

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  if (loading) return <div className="p-8 text-slate-400">Chargement…</div>;
  if (error)   return <div className="p-8 text-red-400">Erreur : {error}</div>;
  if (!dashboard) return null;

  const exports30d = dashboard.usage_last_30d['course_export'] ?? 0;
  const apiCalls30d = dashboard.usage_last_30d['api_call'] ?? 0;
  const validations30d = dashboard.usage_last_30d['license_validate'] ?? 0;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Vue d'ensemble de la plateforme Kàggu</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Organisations actives"
          value={dashboard.organizations.active}
          sub={`${dashboard.organizations.total} total`}
          icon="🏢"
          color="indigo"
        />
        <KpiCard
          label="Licences actives"
          value={dashboard.licenses.active}
          icon="🔑"
          color="green"
        />
        <KpiCard
          label="Exports (30j)"
          value={exports30d}
          icon="📤"
          color="yellow"
        />
        <KpiCard
          label="Validations licence (30j)"
          value={validations30d}
          sub={`${apiCalls30d} appels API`}
          icon="✅"
          color="indigo"
        />
      </div>

      {/* Charts + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <UsageChart
            data={dashboard.usage_last_30d}
            title="Événements sur 30 jours (par type)"
          />
        </div>
        <RecentActivity />
      </div>

      {/* Plans */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Plans actifs</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {dashboard.plans.filter(p => p.is_active).map((plan) => (
            <div key={plan.id} className="bg-slate-800 rounded-lg p-3">
              <div className="text-sm font-medium text-white">{plan.name}</div>
              <div className="text-xs text-slate-400 mt-1">
                {plan.price_monthly_cents === 0
                  ? 'Gratuit'
                  : `${(plan.price_monthly_cents / 100).toFixed(0)} €/mois`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
