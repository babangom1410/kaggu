import { useEffect, useState } from 'react';
import { useAdminStore } from '@/stores/admin-store';
import { updatePlan } from '@/api/admin-api';
import type { SubscriptionPlan } from '@/types/admin.types';

export function PlanManager() {
  const { plans, loading, error, fetchPlans } = useAdminStore();

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    try {
      await updatePlan(plan.id, { is_active: !plan.is_active });
      fetchPlans();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Plans d'abonnement</h1>
        <p className="text-sm text-slate-400 mt-1">{plans.length} plans</p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Chargement…</div>
      ) : error ? (
        <div className="text-red-400 text-sm">Erreur : {error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className={`bg-slate-900 border rounded-xl p-5 space-y-4 ${plan.is_active ? 'border-slate-800' : 'border-slate-800 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{plan.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{plan.slug}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">
                    {plan.price_monthly_cents === 0 ? 'Gratuit' : `${(plan.price_monthly_cents / 100).toFixed(0)} €`}
                  </div>
                  {plan.price_monthly_cents > 0 && <div className="text-xs text-slate-500">/mois</div>}
                </div>
              </div>

              {plan.description && <p className="text-sm text-slate-400">{plan.description}</p>}

              <div>
                <div className="text-xs text-slate-500 mb-2">Limites</div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(plan.limits).map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-slate-500">{k.replace(/_/g, ' ')}: </span>
                      <span className="text-slate-300">{v === -1 ? '∞' : v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-2">Fonctionnalités</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(plan.features).filter(([, v]) => v).map(([k]) => (
                    <span key={k} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-xs">
                      {k.replace(/_enabled|_/g, ' ').trim()}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleToggleActive(plan)}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  plan.is_active
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
                }`}
              >
                {plan.is_active ? 'Désactiver' : 'Activer'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
