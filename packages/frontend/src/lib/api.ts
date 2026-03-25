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

export interface MoodleConfigApi {
  url: string;
  token: string;
  courseId?: number | null;
  siteInfo?: {
    sitename: string;
    username: string;
    moodleVersion: string;
    release: string;
    hasPlugin: boolean;
  };
}

export interface ProjectFull extends ProjectSummary {
  nodes: unknown[];
  edges: unknown[];
  moodle_config: MoodleConfigApi | null;
}

export const projectsApi = {
  list: () => request<ProjectSummary[]>('/v1/projects'),

  get: (id: string) => request<ProjectFull>(`/v1/projects/${id}`),

  create: (name: string, nodes: unknown[], edges: unknown[]) =>
    request<ProjectFull>('/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name, nodes, edges }),
    }),

  update: (id: string, payload: Partial<Pick<ProjectFull, 'name' | 'nodes' | 'edges' | 'moodle_config'>>) =>
    request<ProjectFull>(`/v1/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    request<null>(`/v1/projects/${id}`, { method: 'DELETE' }),
};

// ─── Moodle API ───────────────────────────────────────────────────────────────

export interface MoodleConnectResult {
  sitename: string;
  username: string;
  moodleVersion: string;
  release: string;
  hasPlugin: boolean;
  missingFunctions: string[];
}

export interface MoodleCategory {
  id: number;
  name: string;
  parent: number;
  coursecount: number;
  depth: number;
  path: string;
}

export interface ExportError {
  nodeId: string;
  nodeName: string;
  error: string;
}

export interface ExportReport {
  courseId: number;
  courseUrl: string;
  courseName: string;
  created: number;
  updated: number;
  skipped: number;
  errors: ExportError[];
}

export interface ImportResult {
  nodes: unknown[];
  edges: unknown[];
}

export interface ImportPreview {
  courseId: number;
  courseName: string;
  shortname: string;
  hasContent: boolean;
  sectionsWarning: string | null;
  sections: {
    name: string;
    modulesCount: number;
    modules: { name: string; modname: string }[];
  }[];
}

export const moodleApi = {
  connect: (url: string, token: string) =>
    request<MoodleConnectResult>('/v1/moodle/connect', {
      method: 'POST',
      body: JSON.stringify({ url, token }),
    }),

  categories: (url: string, token: string) =>
    request<MoodleCategory[]>('/v1/moodle/categories', {
      method: 'POST',
      body: JSON.stringify({ url, token }),
    }),

  exportProject: (projectId: string) =>
    request<ExportReport>(`/v1/moodle/projects/${projectId}/export`, {
      method: 'POST',
    }),

  previewImport: (projectId: string, courseRef: string) =>
    request<ImportPreview>(`/v1/moodle/projects/${projectId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ courseRef }),
    }),

  importFromMoodle: (projectId: string, courseRef: string) =>
    request<ImportResult>(`/v1/moodle/projects/${projectId}/import`, {
      method: 'POST',
      body: JSON.stringify({ courseRef }),
    }),

  resetSync: (projectId: string) =>
    request<{ ok: boolean }>(`/v1/moodle/projects/${projectId}/reset`, {
      method: 'DELETE',
    }),
};
