import { useEffect, useState } from 'react';
import { getUsageLogs } from '@/api/admin-api';
import type { UsageLog } from '@/types/admin.types';

const eventIcons: Record<string, string> = {
  license_validate:    '✅',
  course_export:       '📤',
  module_create:       '🧩',
  api_call:            '⚡',
  admin_license_create:'🔑',
  admin_license_suspend:'⏸',
  admin_license_revoke:'🚫',
  admin_org_create:    '🏢',
  admin_org_suspend:   '🔒',
};

export function RecentActivity() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsageLogs({ from: new Date(Date.now() - 7 * 86400_000).toISOString() })
      .then((data) => setLogs(data.slice(0, 20)))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Activité récente</h3>
      {loading ? (
        <div className="text-slate-600 text-sm">Chargement…</div>
      ) : logs.length === 0 ? (
        <div className="text-slate-600 text-sm">Aucune activité</div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5">{eventIcons[log.event_type] ?? '📋'}</span>
              <div className="min-w-0 flex-1">
                <span className="text-slate-300">{log.event_type}</span>
                {log.organizations && (
                  <span className="text-slate-500"> — {log.organizations.name}</span>
                )}
                <div className="text-slate-600">
                  {new Date(log.created_at).toLocaleString('fr-FR')}
                  {log.ip_address && ` · ${log.ip_address}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
