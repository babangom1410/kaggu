import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` };
    return { data: json.data as T, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

export interface ProjectSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectFull extends ProjectSummary {
  nodes: unknown[];
  edges: unknown[];
  moodle_config: unknown | null;
}

export const projectsApi = {
  list: () => request<ProjectSummary[]>('/v1/projects'),

  get: (id: string) => request<ProjectFull>(`/v1/projects/${id}`),

  create: (name: string, nodes: unknown[], edges: unknown[]) =>
    request<ProjectFull>('/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name, nodes, edges }),
    }),

  update: (id: string, payload: Partial<Pick<ProjectFull, 'name' | 'nodes' | 'edges'>>) =>
    request<ProjectFull>(`/v1/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    request<null>(`/v1/projects/${id}`, { method: 'DELETE' }),
};
