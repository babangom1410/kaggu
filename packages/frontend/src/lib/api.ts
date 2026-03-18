import { supabase } from './supabase';

// In production VITE_API_URL = https://kaggu-api.app.senelit.pro
// In dev, the Vite proxy handles /api → localhost:3001
const origin = import.meta.env.VITE_API_URL ?? '';
const API_BASE = origin ? `${origin}/api` : '/api';

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

    // Guard against HTML error pages (nginx 502, Coolify proxy errors, etc.)
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      console.error('[api] Non-JSON response:', res.status, text.slice(0, 200));
      return { data: null, error: `Server error (${res.status})` };
    }

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
