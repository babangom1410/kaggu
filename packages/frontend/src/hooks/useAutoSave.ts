import { useEffect, useRef } from 'react';
import { useMindmapStore } from '@/stores/mindmap-store';
import { useAuthStore } from '@/stores/auth-store';
import { projectsApi } from '@/lib/api';

const DEBOUNCE_MS = 2000;

/**
 * Watches mindmap state and auto-saves to the backend after DEBOUNCE_MS of inactivity.
 * Only active when authenticated and a projectId is set in the store.
 */
export function useAutoSave() {
  const user = useAuthStore((s) => s.user);
  const { nodes, edges, projectName, projectId, moodleConfig, setSyncStatus } = useMindmapStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !projectId) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    setSyncStatus('syncing');

    timerRef.current = setTimeout(async () => {
      const { error } = await projectsApi.update(projectId, {
        name: projectName,
        nodes,
        edges,
        moodle_config: moodleConfig ?? null,
      });
      setSyncStatus(error ? 'error' : 'synced');
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // nodes/edges/projectName/moodleConfig change → restart timer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, projectName, moodleConfig, user, projectId]);
}
