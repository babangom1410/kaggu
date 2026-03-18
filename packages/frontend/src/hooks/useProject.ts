import { useEffect, useState } from 'react';
import { projectsApi } from '@/lib/api';
import { useMindmapStore } from '@/stores/mindmap-store';
import { useAuthStore } from '@/stores/auth-store';
import type { MindmapNode, MindmapEdge, MoodleConfig } from '@/types/mindmap.types';

/**
 * On mount (after login):
 *  1. Fetch the user's most recent project
 *  2. If none exists, create one from the current local state
 *  3. Load the project data into the mindmap store
 */
export function useProject() {
  const user = useAuthStore((s) => s.user);
  const { nodes, edges, projectName, loadProject } = useMindmapStore();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function init() {
      const { data: projects, error: listErr } = await projectsApi.list();
      if (cancelled) return;

      if (listErr) {
        setError(listErr);
        setReady(true);
        return;
      }

      if (projects && projects.length > 0) {
        // Load the most recent project
        const { data: project, error: getErr } = await projectsApi.get(projects[0].id);
        if (cancelled) return;
        if (getErr || !project) {
          setError(getErr);
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
      } else {
        // First login — persist current local state to Supabase
        const { data: created, error: createErr } = await projectsApi.create(projectName, nodes, edges);
        if (cancelled) return;
        if (createErr || !created) {
          setError(createErr);
          setReady(true);
          return;
        }
        loadProject(created.id, created.name, nodes, edges);
      }

      setReady(true);
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { ready, error };
}
