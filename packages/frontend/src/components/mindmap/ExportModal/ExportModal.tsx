import { useState } from 'react';
import { moodleApi, type ExportReport } from '@/lib/api';
import { useMindmapStore } from '@/stores/mindmap-store';

interface ExportModalProps {
  onClose: () => void;
}

type ExportState = 'idle' | 'exporting' | 'done' | 'error';

export function ExportModal({ onClose }: ExportModalProps) {
  const { projectId, moodleConfig, setMoodleConfig } = useMindmapStore();
  const [state, setState] = useState<ExportState>('idle');
  const [isResetting, setIsResetting] = useState(false);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExport = async () => {
    if (!projectId) return;
    setState('exporting');
    setErrorMsg(null);

    const { data, error } = await moodleApi.exportProject(projectId);
    if (error || !data) {
      setState('error');
      setErrorMsg(error ?? 'Export failed');
      return;
    }

    // Update moodleConfig with the new courseId returned from the export
    if (moodleConfig && data.courseId && moodleConfig.courseId !== data.courseId) {
      setMoodleConfig({ ...moodleConfig, courseId: data.courseId });
    }

    setReport(data);
    setState('done');
  };

  const handleReset = async () => {
    if (!projectId) return;
    if (!window.confirm('Supprimer la synchronisation Moodle ? Le prochain export recréera tout le cours depuis zéro.')) return;
    setIsResetting(true);
    await moodleApi.resetSync(projectId);
    if (moodleConfig) setMoodleConfig({ ...moodleConfig, courseId: null });
    setIsResetting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v9M4 7l3 3 3-3M1 11v1a1 1 0 001 1h10a1 1 0 001-1v-1"
                  stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-200">Export vers Moodle</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500
                       hover:bg-slate-700 hover:text-slate-300 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Idle state */}
          {state === 'idle' && (
            <>
              <p className="text-sm text-slate-300">
                L'export va créer ou mettre à jour le cours Moodle correspondant à ce projet.
              </p>
              {moodleConfig?.courseId && (
                <div className="bg-slate-800 rounded-xl p-3 text-xs text-slate-400 space-y-2">
                  <div>
                    <span>Cours existant : </span>
                    <a
                      href={`${moodleConfig.url}/course/view.php?id=${moodleConfig.courseId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 underline"
                    >
                      #{moodleConfig.courseId} ↗
                    </a>
                    <span className="ml-1 text-slate-500">— sera mis à jour</span>
                  </div>
                  <button
                    onClick={handleReset}
                    disabled={isResetting}
                    className="flex items-center gap-1.5 text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1 5a4 4 0 104-4H4m0-1L2 2l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {isResetting ? 'Réinitialisation…' : 'Réinitialiser la synchronisation (export complet)'}
                  </button>
                </div>
              )}
              {!moodleConfig?.courseId && (
                <div className="bg-slate-800 rounded-xl p-3 text-xs text-slate-400">
                  Un nouveau cours sera créé dans Moodle.
                </div>
              )}
              <button
                onClick={handleExport}
                className="w-full py-2.5 rounded-xl text-sm font-semibold
                           bg-orange-600 text-white hover:bg-orange-500 transition-colors"
              >
                Lancer l'export
              </button>
            </>
          )}

          {/* Exporting */}
          {state === 'exporting' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <div className="text-sm font-medium text-slate-200">Export en cours…</div>
                <div className="text-xs text-slate-500 mt-1">Création du cours, sections et activités dans Moodle</div>
              </div>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="space-y-3">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <div className="text-xs font-semibold text-red-400 mb-1">Export échoué</div>
                <div className="text-xs text-red-300">{errorMsg}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setState('idle')}
                  className="flex-1 py-2 rounded-xl text-sm font-medium
                             bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  Réessayer
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-xl text-sm font-medium
                             bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {state === 'done' && report && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-emerald-400">{report.created}</div>
                  <div className="text-xs text-emerald-500/80 mt-0.5">Créés</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-blue-400">{report.updated}</div>
                  <div className="text-xs text-blue-500/80 mt-0.5">Mis à jour</div>
                </div>
                <div className={`rounded-xl p-3 text-center border ${
                  report.errors.length > 0
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-slate-800 border-slate-700'
                }`}>
                  <div className={`text-lg font-bold ${report.errors.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {report.errors.length + report.skipped}
                  </div>
                  <div className={`text-xs mt-0.5 ${report.errors.length > 0 ? 'text-red-500/80' : 'text-slate-500'}`}>
                    Problèmes
                  </div>
                </div>
              </div>

              {/* Course link */}
              <div className="bg-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Cours Moodle</div>
                  <div className="text-sm font-medium text-slate-200">{report.courseName}</div>
                </div>
                <a
                  href={report.courseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                             bg-orange-600 text-white hover:bg-orange-500 transition-colors"
                >
                  Ouvrir ↗
                </a>
              </div>

              {/* Errors list */}
              {report.errors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-red-400">Erreurs ({report.errors.length})</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {report.errors.map((err, i) => (
                      <div key={i} className="bg-red-500/10 rounded-lg px-3 py-2">
                        <div className="text-xs font-medium text-red-300">{err.nodeName}</div>
                        <div className="text-xs text-red-400/80">{err.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold
                           bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
