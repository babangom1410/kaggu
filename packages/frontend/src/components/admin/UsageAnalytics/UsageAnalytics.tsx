import { useEffect, useState } from 'react';
import { getUsageLogs } from '@/api/admin-api';
import { useAdminStore } from '@/stores/admin-store';
import type { UsageLog } from '@/types/admin.types';

const EVENT_TYPES = [
  'license_validate', 'course_export', 'module_create', 'api_call',
  'admin_license_create', 'admin_license_suspend', 'admin_license_revoke',
  'admin_org_create', 'admin_org_suspend',
];

export function UsageAnalytics() {
  const { organizations, fetchOrganizations } = useAdminStore();
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  useEffect(() => { fetchOrganizations(); }, [fetchOrganizations]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getUsageLogs({
        ...(orgFilter ? { org: orgFilter } : {}),
        ...(typeFilter ? { event_type: typeFilter } : {}),
        ...(fromFilter ? { from: new Date(fromFilter).toISOString() } : {}),
        ...(toFilter ? { to: new Date(toFilter).toISOString() } : {}),
      });
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [orgFilter, typeFilter, fromFilter, toFilter]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Usage Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">{logs.length} événements</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">Toutes les orgs</option>
          {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">Tous les types</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
        <input type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Chargement…</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Organisation</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Moodle URL</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 text-xs">
                  <td className="px-4 py-2.5 text-slate-500">
                    {new Date(log.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded font-mono">
                      {log.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {log.organizations?.name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[160px] truncate">
                    {log.moodle_url ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{log.ip_address ?? '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-600">Aucun événement</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
