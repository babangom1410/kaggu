import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectSummary } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useMindmapStore } from '@/stores/mindmap-store';

const DEFAULT_COURSE_NODE = {
  id: 'course-root',
  type: 'course',
  position: { x: 400, y: 80 },
  data: { fullname: 'Nouveau cours', shortname: 'NOUVEAU', format: 'topics', visible: true, category: 1 },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: ProjectSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="group relative bg-slate-800 border border-slate-700 rounded-2xl p-5 cursor-pointer
                 hover:border-indigo-500/50 hover:bg-slate-750 transition-all duration-200 flex flex-col gap-3"
      onClick={onOpen}
    >
      {/* Preview area */}
      <div className="h-28 bg-slate-900/60 rounded-xl flex items-center justify-center border border-slate-700/50">
        <span className="text-3xl opacity-40">🗺</span>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 flex-1">
        <span className="text-sm font-semibold text-slate-100 truncate">{project.name}</span>
        <span className="text-xs text-slate-500">Modifié le {formatDate(project.updated_at)}</span>
      </div>

      {/* Delete button */}
      {confirming ? (
        <div
          className="flex gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 text-red-400
                       border border-red-500/30 hover:bg-red-500/30 transition-colors"
            onClick={onDelete}
          >
            Confirmer
          </button>
          <button
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-400
                       border border-slate-600 hover:bg-slate-600 transition-colors"
            onClick={() => setConfirming(false)}
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          className="opacity-0 group-hover:opacity-100 absolute top-3 right-3 w-7 h-7 rounded-lg
                     flex items-center justify-center bg-slate-700/80 text-slate-400
                     hover:bg-red-500/20 hover:text-red-400 transition-all duration-150"
          title="Supprimer le projet"
          onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3h9M5 3V2h3v1M4 3l.5 7h4L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ProjectList() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();
  const resetStore = useMindmapStore((s) => s.loadProject);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projectsApi.list().then(({ data, error: err }) => {
      if (err) setError(err);
      else setProjects(data ?? []);
      setLoading(false);
    });
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    const { data, error: err } = await projectsApi.create(
      'Nouveau projet',
      [DEFAULT_COURSE_NODE],
      [],
    );
    setCreating(false);
    if (err || !data) { setError(err ?? 'Erreur création'); return; }
    navigate(`/projects/${data.id}`);
  };

  const handleDelete = async (id: string) => {
    await projectsApi.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const handleOpen = (id: string) => {
    // Reset store so previous project data doesn't flash
    resetStore(id, '', [], [], null);
    navigate(`/projects/${id}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 h-14 border-b border-white/8 bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm">
            <span className="text-sm">🗺</span>
          </div>
          <span className="font-bold text-white text-sm tracking-tight">kàggu</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5
                       rounded-lg hover:bg-white/8"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-white">Mes projets</h1>
            <p className="text-sm text-slate-500 mt-0.5">Concevez vos cours Moodle avec l'éditeur visuel</p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                       bg-indigo-500 text-white hover:bg-indigo-400 transition-colors
                       disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            Nouveau projet
          </button>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-3xl">
              🗺
            </div>
            <div>
              <p className="text-slate-300 font-medium">Aucun projet pour l'instant</p>
              <p className="text-sm text-slate-500 mt-1">Créez votre premier projet pour commencer</p>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-500 text-white
                         hover:bg-indigo-400 transition-colors disabled:opacity-60"
            >
              Créer un projet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => handleOpen(p.id)}
                onDelete={() => handleDelete(p.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
