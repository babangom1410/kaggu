import { useEffect, useState } from 'react';
import { projectsApi } from '@/lib/api';
import { useMindmapStore } from '@/stores/mindmap-store';
import type { MindmapNode, MindmapEdge, MoodleConfig } from '@/types/mindmap.types';

/**
 * Loads a specific project by ID into the mindmap store.
 */
export function useProject(projectId: string) {
  const { loadProject } = useMindmapStore();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setReady(false);
    setError(null);

    async function init() {
      const { data: project, error: getErr } = await projectsApi.get(projectId);
      if (cancelled) return;

      if (getErr || !project) {
        setError(getErr ?? 'Projet introuvable');
        setReady(true);
        return;
      }

      loadProject(
        project.id,
        project.name,
        project.nodes as MindmapNode[],
        project.edges as MindmapEdge[],
        project.moodle_config as MoodleConfig | null,
      );
      setReady(true);
    }

    init();
    return () => { cancelled = true; };
  }, [projectId, loadProject]);

  return { ready, error };
}
