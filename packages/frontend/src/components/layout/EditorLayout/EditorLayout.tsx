import { useProject } from '@/hooks/useProject';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Toolbar } from '@/components/mindmap/Toolbar';
import { MindmapEditor } from '@/components/mindmap/MindmapEditor';
import { PropertiesPanel } from '@/components/mindmap/PropertiesPanel';
import { useMindmapStore } from '@/stores/mindmap-store';

function ProjectLoader({ children }: { children: React.ReactNode }) {
  const { ready, error } = useProject();
  useAutoSave();

  if (!ready) {
    return (
      <div className="flex flex-col h-screen w-screen bg-slate-900 items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-500">Chargement du projet…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen w-screen bg-slate-900 items-center justify-center gap-3">
        <span className="text-sm text-red-400">Erreur : {error}</span>
        <span className="text-xs text-slate-500">Vérifiez votre connexion et rechargez la page.</span>
      </div>
    );
  }

  return <>{children}</>;
}

export function EditorLayout() {
  const selectedNodeId = useMindmapStore((s) => s.selectedNodeId);

  return (
    <ProjectLoader>
      <div className="flex flex-col h-screen w-screen bg-slate-900">
        <Toolbar />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 relative">
            <MindmapEditor />
          </div>

          <div
            className={`
              flex-shrink-0 border-l border-slate-700/50 bg-slate-900 overflow-hidden
              transition-all duration-200 ease-in-out
              ${selectedNodeId ? 'w-[340px]' : 'w-0'}
            `}
          >
            {selectedNodeId && <PropertiesPanel nodeId={selectedNodeId} />}
          </div>
        </div>
      </div>
    </ProjectLoader>
  );
}
