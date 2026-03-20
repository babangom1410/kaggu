import { useState } from 'react';
import { createLicense, getSubscriptions } from '@/api/admin-api';
import type { Organization, Subscription } from '@/types/admin.types';

interface Props {
  organizations: Organization[];
  onClose: () => void;
  onCreated: (key: string) => void;
}

export function GenerateLicenseModal({ organizations, onClose, onCreated }: Props) {
  const [orgId, setOrgId] = useState('');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subId, setSubId] = useState('');
  const [tier, setTier] = useState<'TRI' | 'STR' | 'PRO' | 'ENT'>('PRO');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOrgChange = async (id: string) => {
    setOrgId(id);
    setSubId('');
    if (id) {
      const subs = await getSubscriptions(id);
      setSubscriptions(subs);
    }
  };

  const handleSubmit = async () => {
    if (!orgId || !subId) { setError('Sélectionne une organisation et un abonnement'); return; }
    setLoading(true);
    setError('');
    try {
      const license = await createLicense({
        organization_id: orgId,
        subscription_id: subId,
        tier,
        ...(expiresAt ? { expires_at: new Date(expiresAt).toISOString() } : {}),
      });
      onCreated(license.key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Générer une clé de licence</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Organisation</label>
            <select value={orgId} onChange={(e) => handleOrgChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">Sélectionner…</option>
              {organizations.filter(o => o.status === 'active').map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Abonnement</label>
            <select value={subId} onChange={(e) => setSubId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">Sélectionner…</option>
              {subscriptions.map(s => (
                <option key={s.id} value={s.id}>{s.status} — {s.subscription_plans?.name ?? s.plan_id}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Tier</label>
            <select value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="TRI">TRI — Trial</option>
              <option value="STR">STR — Starter</option>
              <option value="PRO">PRO — Pro</option>
              <option value="ENT">ENT — Enterprise</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Expiration (optionnel)</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
        </div>

        {error && <div className="text-red-400 text-xs">{error}</div>}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors disabled:opacity-50">
            {loading ? 'Génération…' : 'Générer'}
          </button>
        </div>
      </div>
    </div>
  );
}
