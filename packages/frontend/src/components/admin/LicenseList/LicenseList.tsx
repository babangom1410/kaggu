import { useEffect, useState } from 'react';
import { useAdminStore } from '@/stores/admin-store';
import { useAdminStore as useStore } from '@/stores/admin-store';
import { GenerateLicenseModal } from './GenerateLicenseModal';
import type { LicenseKey } from '@/types/admin.types';
import * as api from '@/api/admin-api';

const statusColors: Record<LicenseKey['status'], string> = {
  active:    'bg-emerald-500/10 text-emerald-400',
  suspended: 'bg-yellow-500/10 text-yellow-400',
  revoked:   'bg-red-500/10 text-red-400',
  expired:   'bg-slate-500/10 text-slate-400',
};

export function LicenseList() {
  const { licenses, loading, error, fetchLicenses, updateLicense, regenerateLicense, resetLicenseBinding } = useAdminStore();
  const { organizations, fetchOrganizations } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  useEffect(() => {
    fetchLicenses();
    fetchOrganizations();
  }, [fetchLicenses, fetchOrganizations]);

  const handleAction = async (action: () => Promise<void>) => {
    try { await action(); } catch (e) { alert((e as Error).message); }
  };

  const handleCreated = (key: string) => {
    setNewKey(key);
    setShowModal(false);
    fetchLicenses();
  };

  const filtered = orgFilter ? licenses.filter(l => l.organization_id === orgFilter) : licenses;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Licences</h1>
          <p className="text-sm text-slate-400 mt-1">{licenses.length} clés</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm text-white rounded-lg font-medium transition-colors">
          + Nouvelle clé
        </button>
      </div>

      {newKey && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-emerald-400 mb-1">Clé générée — copiez-la maintenant</div>
            <code className="text-sm text-white font-mono">{newKey}</code>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(newKey); }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs text-white rounded-lg transition-colors">
            Copier
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">Toutes les orgs</option>
          {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Chargement…</div>
      ) : error ? (
        <div className="text-red-400 text-sm">Erreur : {error}</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Clé</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Organisation</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Statut</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Moodle URL</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Expire</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lic) => (
                <tr key={lic.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{lic.key}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {lic.organizations?.name ?? lic.organization_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[lic.status]}`}>
                      {lic.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">
                    {lic.moodle_url ?? <span className="text-slate-700">Non bindée</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {lic.status === 'active' && (
                        <button onClick={() => handleAction(() => updateLicense(lic.id, 'suspended'))}
                          className="px-2 py-1 text-xs bg-yellow-500/10 text-yellow-400 rounded hover:bg-yellow-500/20 transition-colors">
                          Suspendre
                        </button>
                      )}
                      {lic.status === 'suspended' && (
                        <button onClick={() => handleAction(() => updateLicense(lic.id, 'active'))}
                          className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20 transition-colors">
                          Activer
                        </button>
                      )}
                      {lic.status !== 'revoked' && (
                        <button onClick={() => {
                          if (confirm('Révoquer cette clé ? Action irréversible.') && confirm('Confirmer la révocation ?'))
                            handleAction(() => updateLicense(lic.id, 'revoked'));
                        }}
                          className="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors">
                          Révoquer
                        </button>
                      )}
                      {lic.moodle_url && (
                        <button onClick={() => handleAction(() => resetLicenseBinding(lic.id))}
                          className="px-2 py-1 text-xs bg-slate-700 text-slate-400 rounded hover:bg-slate-600 transition-colors">
                          Reset URL
                        </button>
                      )}
                      <button onClick={() => {
                        if (confirm('Régénérer ? L\'ancienne clé sera révoquée.'))
                          handleAction(() => regenerateLicense(lic.id));
                      }}
                        className="px-2 py-1 text-xs bg-indigo-500/10 text-indigo-400 rounded hover:bg-indigo-500/20 transition-colors">
                        Regen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600 text-sm">Aucune licence</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <GenerateLicenseModal
          organizations={organizations}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
