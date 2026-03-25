import { useState } from 'react';
import { moodleApi, type ImportPreview } from '@/lib/api';
import { useMindmapStore } from '@/stores/mindmap-store';
import type { MindmapNode, MindmapEdge } from '@/types/mindmap.types';

const MOD_ICONS: Record<string, string> = {
  assign: '📋', quiz: '❓', forum: '💬', h5pactivity: '🎮', glossary: '📖',
  scorm: '🎯', lesson: '📘', choice: '📊', url: '🔗', page: '📝',
  resource: '📄', book: '📚', folder: '📁',
};

interface ImportModalProps {
  onClose: () => void;
}

type Step = 'form' | 'previewing' | 'preview' | 'importing' | 'done' | 'error';

export function ImportModal({ onClose }: ImportModalProps) {
  const { projectId, loadProject, projectName, moodleConfig } = useMindmapStore();
  const [step, setStep] = useState<Step>('form');
  const [courseIdInput, setCourseIdInput] = useState(
    moodleConfig?.courseId ? String(moodleConfig.courseId) : '',
  );
  const courseRef = courseIdInput.trim();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const handlePreview = async () => {
    if (!projectId || !courseRef) return;
    setStep('previewing');
    setErrorMsg(null);

    const { data, error } = await moodleApi.previewImport(projectId, courseRef);
    if (error || !data) {
      setErrorMsg(error ?? 'Impossible de charger la prévisualisation');
      setStep('error');
      return;
    }
    setPreview(data);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!projectId || !preview) return;
    setStep('importing');

    const { data, error } = await moodleApi.importFromMoodle(projectId, courseRef || String(preview.courseId));
    if (error || !data) {
      setErrorMsg(error ?? 'Import échoué');
      setStep('error');
      return;
    }

    loadProject(
      projectId,
      projectName,
      data.nodes as MindmapNode[],
      data.edges as MindmapEdge[],
      moodleConfig,
    );
    setStep('done');
  };

  const toggleSection = (i: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const totalModules = preview?.sections.reduce((acc, s) => acc + s.modulesCount, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 13V4M4 7l3-3 3 3M1 11v1a1 1 0 001 1h10a1 1 0 001-1v-1"
                  stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-200">Import depuis Moodle</span>
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
          {/* Form step */}
          {step === 'form' && (
            <>
              <p className="text-sm text-slate-300">
                Entrez l'identifiant du cours Moodle à importer. La structure sera prévisualisée avant confirmation.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  ID du cours Moodle
                </label>
                <input
                  type="text"
                  value={courseIdInput}
                  onChange={(e) => setCourseIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                  placeholder="ex. PHYS101 ou 42"
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                             border border-slate-700 focus:border-sky-500 focus:outline-none
                             placeholder:text-slate-600"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1">Nom abrégé du cours (ex. PHYS101) ou identifiant numérique</p>
              </div>
              <button
                onClick={handlePreview}
                disabled={!courseRef}
                className="w-full py-2.5 rounded-xl text-sm font-semibold
                           bg-sky-600 text-white hover:bg-sky-500 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prévisualiser
              </button>
            </>
          )}

          {/* Previewing */}
          {step === 'previewing' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-sm text-slate-400">Chargement de la structure du cours…</div>
            </div>
          )}

          {/* Preview step */}
          {step === 'preview' && preview && (
            <>
              {/* Course summary */}
              <div className="bg-slate-800 rounded-xl p-3 space-y-1">
                <div className="text-xs text-slate-400">Cours à importer</div>
                <div className="text-sm font-semibold text-slate-100">{preview.courseName}</div>
                <div className="text-xs text-slate-500">{preview.shortname} — {preview.sections.length} section(s), {totalModules} module(s)</div>
              </div>

              {/* Conflict warning */}
              {preview.hasContent && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2.5">
                  <span className="text-amber-400 flex-shrink-0">⚠</span>
                  <p className="text-xs text-amber-300 leading-relaxed">
                    Le mindmap actuel contient déjà des nœuds. L'import <strong>remplacera entièrement</strong> le contenu existant.
                  </p>
                </div>
              )}

              {/* Sections fetch warning (broken Moodle records) */}
              {preview.sectionsWarning && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2.5">
                  <span className="text-red-400 flex-shrink-0">⚠</span>
                  <div className="text-xs text-red-300 leading-relaxed space-y-1">
                    <p className="font-medium">Impossible de charger les sections du cours.</p>
                    <p className="text-red-400/70">Ce cours contient probablement des modules avec des données incomplètes dans Moodle (ex. SCORM sans fichier, Leçon sans page). Vous pouvez quand même tenter l'import — les modules problématiques seront ignorés.</p>
                  </div>
                </div>
              )}

              {/* Sections list */}
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {preview.sections.map((section, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection(i)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 text-xs">📂</span>
                        <span className="text-xs font-medium text-slate-200 truncate max-w-[220px]">{section.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-500">{section.modulesCount}</span>
                        <svg
                          width="10" height="10" viewBox="0 0 10 10" fill="none"
                          className={`text-slate-500 transition-transform ${expandedSections.has(i) ? 'rotate-180' : ''}`}
                        >
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </button>
                    {expandedSections.has(i) && section.modules.length > 0 && (
                      <div className="px-3 pb-2 space-y-1">
                        {section.modules.map((mod, j) => (
                          <div key={j} className="flex items-center gap-2 pl-4">
                            <span className="text-xs">{MOD_ICONS[mod.modname] ?? '📦'}</span>
                            <span className="text-xs text-slate-400 truncate">{mod.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep('form')}
                  className="flex-1 py-2 rounded-xl text-sm font-medium
                             bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={handleImport}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold
                             bg-sky-600 text-white hover:bg-sky-500 transition-colors"
                >
                  {preview.hasContent ? 'Remplacer et importer' : 'Importer'}
                </button>
              </div>
            </>
          )}

          {/* Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <div className="text-sm font-medium text-slate-200">Import en cours…</div>
                <div className="text-xs text-slate-500 mt-1">Construction du mindmap depuis Moodle</div>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && preview && (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                <div className="text-2xl mb-2">✓</div>
                <div className="text-sm font-semibold text-emerald-300">Import réussi</div>
                <div className="text-xs text-emerald-400/80 mt-1">
                  {preview.sections.length} section(s) et {totalModules} module(s) importés
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold
                           bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
              >
                Fermer
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="space-y-3">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <div className="text-xs font-semibold text-red-400 mb-1">Erreur</div>
                <div className="text-xs text-red-300">{errorMsg}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('form')}
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
        </div>
      </div>
    </div>
  );
}
