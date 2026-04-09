import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMindmapStore, generateNodeId } from '@/stores/mindmap-store';
import { useAuthStore } from '@/stores/auth-store';
import type { SyncStatus } from '@/stores/mindmap-store';
import { ExportModal } from '@/components/mindmap/ExportModal';
import { ImportModal } from '@/components/mindmap/ImportModal/ImportModal';
import { CourseStructureWizard } from '@/components/mindmap/AiAssistant';
import { ScenarizationModal } from '@/components/mindmap/ScenarizationModal';
import { analyzeMindmap } from '@/api/llm-api';

// ─── Analyze Modal ────────────────────────────────────────────────────────────

function AnalyzeModal({ summary, onClose }: { summary: string; onClose: () => void }) {
  const [output, setOutput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAnalyze = async () => {
    if (streaming) return;
    setOutput('');
    setError('');
    setStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      await analyzeMindmap(summary, (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === 'delta') setOutput((prev) => prev + (d.text as string));
        if (event === 'error') setError(d.message as string);
      }, controller.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Auto-start on mount
  useEffect(() => { void handleAnalyze(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>🔍</span> Analyse pédagogique
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {(output || streaming) && (
            <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
              {output}
              {streaming && <span className="inline-block w-1.5 h-3.5 bg-indigo-400 animate-pulse ml-0.5" />}
            </div>
          )}
          {error && <div className="text-red-400 text-xs bg-red-500/10 rounded-lg p-3">{error}</div>}
          {!output && !streaming && !error && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="w-4 h-4 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
              Analyse en cours…
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-700 flex justify-between items-center flex-shrink-0">
          {streaming && (
            <button onClick={() => abortControllerRef.current?.abort()}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
              Arrêter
            </button>
          )}
          {!streaming && !output && !error && <span />}
          {!streaming && (output || error) && (
            <button onClick={handleAnalyze}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              Relancer
            </button>
          )}
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 pr-4 border-r border-white/10">
      <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm">
        <span className="text-sm">🗺</span>
      </div>
      <span className="font-bold text-white text-sm tracking-tight">kàggu</span>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`
        w-8 h-8 rounded-lg flex items-center justify-center text-sm
        transition-colors duration-150
        ${
          disabled
            ? 'text-slate-600 cursor-not-allowed'
            : 'text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer'
        }
      `}
    >
      {children}
    </button>
  );
}

function SyncIndicator({ sync }: { sync: SyncStatus }) {
  if (sync === 'syncing') {
    return (
      <div className="flex items-center gap-1.5">
        <svg className="w-3 h-3 text-slate-500 animate-spin" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" />
        </svg>
        <span className="text-xs text-slate-500">Synchronisation…</span>
      </div>
    );
  }
  if (sync === 'error') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs text-red-400">Non synchronisé</span>
      </div>
    );
  }
  if (sync === 'synced') {
    return (
      <div className="flex items-center gap-1.5">
        <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xs text-slate-500">Synchronisé</span>
      </div>
    );
  }
  // idle = local only
  return (
    <div className="flex items-center gap-1.5">
      <svg className="w-3 h-3 text-slate-600" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs text-slate-600">Local</span>
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuthStore();
  const [open, setOpen] = useState(false);
  const email = user?.email ?? '';
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center
                   text-xs font-bold text-white hover:bg-indigo-500 transition-colors"
        title={email}
      >
        {initials}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl py-1 min-w-[200px]">
            <div className="px-3 py-2 border-b border-slate-700">
              <div className="text-xs text-slate-400 truncate">{email}</div>
            </div>
            <button
              onClick={() => { signOut(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300
                         hover:bg-slate-700 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M5 11H2a1 1 0 01-1-1V3a1 1 0 011-1h3M9 9l3-3-3-3M12 6.5H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Toolbar() {
  const navigate = useNavigate();
  const {
    projectName, setProjectName, addNode, nodes, edges,
    undo, redo, canUndo, canRedo, syncStatus,
    moodleConfig, moodlePanelOpen, setMoodlePanelOpen,
  } = useMindmapStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [scenarizationOpen, setScenarizationOpen] = useState(false);
  const [contentGenOpen, setContentGenOpen] = useState(false);

  const isMoodleConnected = !!(moodleConfig?.url && moodleConfig?.token);

  const hasEmptyContentNodes = nodes.some((n) => {
    const d = n.data as unknown as Record<string, unknown>;
    if (n.type === 'resource' && d.subtype === 'page') return !((d.content as string)?.trim());
    if (n.type === 'activity' && d.subtype === 'quiz') {
      const q = d.questions as unknown[] | undefined;
      return !q || q.length === 0;
    }
    return false;
  });

  const handleAddSection = () => {
    const courseNode = nodes.find((n) => n.type === 'course');
    if (!courseNode) return;

    const sectionCount = edges.filter((e) => e.source === courseNode.id).length;
    const xOffset = sectionCount * 240;

    addNode(
      {
        id: generateNodeId(),
        type: 'section',
        position: {
          x: courseNode.position.x - 220 + xOffset,
          y: courseNode.position.y + 200,
        },
        data: { name: `Section ${sectionCount + 1}`, visible: true },
      },
      courseNode.id,
    );
  };

  const handleNameSubmit = () => {
    setProjectName(editValue || 'Nouveau projet');
    setIsEditing(false);
  };

  return (
    <header className="flex items-center gap-3 px-4 h-12 bg-slate-900 border-b border-white/8 shadow-topbar flex-shrink-0 z-10">
      {/* Back to project list */}
      <button
        onClick={() => navigate('/')}
        title="Retour aux projets"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500
                   hover:bg-white/10 hover:text-slate-300 transition-colors duration-150"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 12L4 7l5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <Logo />

      {/* Project name */}
      <div className="flex items-center">
        {isEditing ? (
          <input
            className="bg-white/10 text-white text-sm font-medium rounded-lg px-2.5 py-1
                       border border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50
                       min-w-[180px]"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            autoFocus
          />
        ) : (
          <button
            className="text-slate-200 text-sm font-medium px-2.5 py-1 rounded-lg
                       hover:bg-white/10 hover:text-white transition-colors truncate max-w-[220px]"
            onClick={() => {
              setEditValue(projectName);
              setIsEditing(true);
            }}
            title="Cliquer pour renommer"
          >
            {projectName}
          </button>
        )}
      </div>

      <div className="h-5 w-px bg-white/10 mx-1" />

      {/* Add section */}
      <button
        onClick={handleAddSection}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-emerald-500/15 text-emerald-400 border border-emerald-500/20
                   hover:bg-emerald-500/25 hover:text-emerald-300 transition-all duration-150"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Section
      </button>

      {/* AI Wizard */}
      <button
        onClick={() => setWizardOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-indigo-500/15 text-indigo-400 border border-indigo-500/20
                   hover:bg-indigo-500/25 hover:text-indigo-300 transition-all duration-150"
        title="Générer une structure de cours avec l'IA"
      >
        ✨ Assistant
      </button>

      {/* AI Scénarisation */}
      <button
        onClick={() => setScenarizationOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-amber-500/15 text-amber-400 border border-amber-500/20
                   hover:bg-amber-500/25 hover:text-amber-300 transition-all duration-150"
        title="Générer un cours complet à partir de fichiers (PDF, Markdown)"
      >
        🎓 Scénariser
      </button>

      {/* Phase 2: Content generation */}
      {hasEmptyContentNodes && (
        <button
          onClick={() => setContentGenOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                     bg-teal-500/15 text-teal-400 border border-teal-500/20
                     hover:bg-teal-500/25 hover:text-teal-300 transition-all duration-150"
          title="Générer les contenus des pages et quiz (Phase 2)"
        >
          📝 Contenus
        </button>
      )}

      {/* AI Analyze */}
      <button
        onClick={() => setAnalyzeOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-violet-500/15 text-violet-400 border border-violet-500/20
                   hover:bg-violet-500/25 hover:text-violet-300 transition-all duration-150"
        title="Analyser la cohérence pédagogique du mindmap"
      >
        🔍 Analyser
      </button>

      <div className="flex-1" />

      {/* Sync indicator */}
      <SyncIndicator sync={syncStatus} />

      <div className="h-5 w-px bg-white/10 mx-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <IconButton onClick={undo} disabled={!canUndo()} title="Annuler (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 5H8.5a3.5 3.5 0 010 7H5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M2 5L4.5 2.5M2 5L4.5 7.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <IconButton onClick={redo} disabled={!canRedo()} title="Rétablir (Ctrl+Shift+Z)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M12 5H5.5a3.5 3.5 0 000 7H9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M12 5L9.5 2.5M12 5L9.5 7.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
      </div>

      <div className="h-5 w-px bg-white/10 mx-1" />

      {/* Moodle connect button */}
      <button
        onClick={() => setMoodlePanelOpen(!moodlePanelOpen)}
        title={isMoodleConnected ? `Moodle : ${moodleConfig?.siteInfo?.sitename ?? 'Connecté'}` : 'Configurer Moodle'}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
          border transition-all duration-150
          ${isMoodleConnected
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25'
            : 'bg-white/5 text-slate-400 border-white/8 hover:bg-white/10 hover:text-slate-200'
          }
        `}
      >
        <span className="text-sm">🔌</span>
        {isMoodleConnected ? moodleConfig?.siteInfo?.sitename ?? 'Moodle' : 'Moodle'}
      </button>

      {/* Import Moodle */}
      <button
        onClick={() => setImportModalOpen(true)}
        disabled={!isMoodleConnected}
        title={isMoodleConnected ? 'Importer depuis Moodle' : 'Configurez la connexion Moodle d\'abord'}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border
          transition-all duration-150
          ${isMoodleConnected
            ? 'bg-sky-500/15 text-sky-400 border-sky-500/20 hover:bg-sky-500/25 hover:text-sky-300'
            : 'bg-white/5 text-slate-600 border-white/8 cursor-not-allowed'
          }
        `}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 11V4M3 7l3-3 3 3M1 11h10"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Import
      </button>

      {/* Export Moodle */}
      <button
        onClick={() => setExportModalOpen(true)}
        disabled={!isMoodleConnected}
        title={isMoodleConnected ? 'Exporter vers Moodle' : 'Configurez la connexion Moodle d\'abord'}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border
          transition-all duration-150
          ${isMoodleConnected
            ? 'bg-orange-500/15 text-orange-400 border-orange-500/20 hover:bg-orange-500/25 hover:text-orange-300'
            : 'bg-white/5 text-slate-600 border-white/8 cursor-not-allowed'
          }
        `}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Export
      </button>

      {/* User menu */}
      <UserMenu />

      {/* Import modal */}
      {importModalOpen && <ImportModal onClose={() => setImportModalOpen(false)} />}

      {/* Export modal */}
      {exportModalOpen && <ExportModal onClose={() => setExportModalOpen(false)} />}

      {/* AI Course Structure Wizard */}
      {wizardOpen && <CourseStructureWizard onClose={() => setWizardOpen(false)} />}

      {/* AI Scénarisation Modal */}
      {scenarizationOpen && <ScenarizationModal onClose={() => setScenarizationOpen(false)} />}

      {/* Phase 2: Content Generation Modal — reuses ScenarizationModal at content_setup step */}
      {contentGenOpen && <ScenarizationModal onClose={() => setContentGenOpen(false)} initialStep="content_setup" />}

      {/* AI Analyze Modal */}
      {analyzeOpen && (
        <AnalyzeModal
          summary={nodes.map((n) => {
            const d = n.data as unknown as Record<string, unknown>;
            const label = (d.fullname ?? d.name ?? n.id) as string;
            const subtype = d.subtype ? ` (${d.subtype as string})` : '';
            return `[${n.type}${subtype}] ${label}`;
          }).join('\n')}
          onClose={() => setAnalyzeOpen(false)}
        />
      )}
    </header>
  );
}
