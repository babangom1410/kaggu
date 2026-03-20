import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminStore } from '@/stores/admin-store';
import type { Organization } from '@/types/admin.types';

const statusColors: Record<Organization['status'], string> = {
  active:    'bg-emerald-500/10 text-emerald-400',
  suspended: 'bg-yellow-500/10 text-yellow-400',
  deleted:   'bg-red-500/10 text-red-400',
};

export function OrganizationList() {
  const { organizations, loading, error, fetchOrganizations } = useAdminStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => { fetchOrganizations(); }, [fetchOrganizations]);

  const filtered = organizations.filter((org) => {
    const matchSearch = org.name.toLowerCase().includes(search.toLowerCase()) ||
                        org.slug.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || org.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Organisations</h1>
          <p className="text-sm text-slate-400 mt-1">{organizations.length} organisations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actif</option>
          <option value="suspended">Suspendu</option>
          <option value="deleted">Supprimé</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 text-sm">Chargement…</div>
      ) : error ? (
        <div className="text-red-400 text-sm">Erreur : {error}</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Organisation</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Contact</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Pays</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Statut</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Créé le</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((org) => (
                <tr key={org.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{org.name}</div>
                    <div className="text-xs text-slate-500">{org.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-300">{org.contact_name}</div>
                    <div className="text-xs text-slate-500">{org.contact_email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{org.country ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[org.status]}`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(org.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/organizations/${org.id}`}
                      className="text-indigo-400 hover:text-indigo-300 text-xs"
                    >
                      Détail →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-600 text-sm">
                    Aucune organisation
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
