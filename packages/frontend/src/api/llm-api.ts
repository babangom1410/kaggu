import { supabase } from '@/lib/supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

export type SSECallback = (event: string, data: unknown) => void;

async function streamPost(path: string, body: unknown, onEvent: SSECallback, signal?: AbortSignal): Promise<void> {
  const token = await getToken();

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent = 'message';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(currentEvent, data);
        } catch {
          // skip malformed line
        }
        currentEvent = 'message';
      }
    }
  }
}

export interface GenerateParams {
  nodeType: 'course' | 'section' | 'resource' | 'activity';
  nodeSubtype?: string;
  nodeName: string;
  prompt: string;
  courseContext?: string;
}

export function generateContent(params: GenerateParams, onEvent: SSECallback, signal?: AbortSignal) {
  return streamPost('/api/v1/llm/generate', params, onEvent, signal);
}

export function generateCourseStructure(description: string, onEvent: SSECallback, signal?: AbortSignal) {
  return streamPost('/api/v1/llm/course-structure', { description }, onEvent, signal);
}

export function analyzeMindmap(mindmapSummary: string, onEvent: SSECallback, signal?: AbortSignal) {
  return streamPost('/api/v1/llm/analyze', { mindmapSummary }, onEvent, signal);
}

export async function generateLesson(
  lessonName: string,
  prompt: string,
  pageCount = 5,
  pageTypes: ('content' | 'multichoice' | 'truefalse' | 'shortanswer')[] = ['content', 'multichoice'],
): Promise<unknown[]> {
  const token = await getToken();
  const res = await fetch(`${BASE}/api/v1/llm/generate-lesson`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lessonName, prompt, pageCount, pageTypes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as Record<string, string>).error ?? res.statusText);
  }
  return ((await res.json()) as { data: unknown[] }).data;
}

export async function generateBook(
  bookName: string,
  prompt: string,
  chapterCount = 6,
): Promise<unknown[]> {
  const token = await getToken();
  const res = await fetch(`${BASE}/api/v1/llm/generate-book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bookName, prompt, chapterCount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as Record<string, string>).error ?? res.statusText);
  }
  return ((await res.json()) as { data: unknown[] }).data;
}

export interface ScenarizationFile {
  name: string;
  type: 'pdf' | 'markdown' | 'text';
  content: string; // base64 for pdf, plain text for others
}

export interface ScenarizationParams {
  files: ScenarizationFile[];
  level: string;
  duration: string;
  moduleCount: number;
  language: string;
  additionalContext?: string;
}

export function scenarizeCourse(params: ScenarizationParams, onEvent: SSECallback, signal?: AbortSignal) {
  return streamPost('/api/v1/llm/scenarize', params, onEvent, signal);
}

export async function generateFeedback(
  feedbackName: string,
  prompt: string,
  itemCount = 5,
): Promise<unknown[]> {
  const token = await getToken();
  const res = await fetch(`${BASE}/api/v1/llm/generate-feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ feedbackName, prompt, itemCount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as Record<string, string>).error ?? res.statusText);
  }
  const json = await res.json() as { data: unknown[] };
  return json.data;
}
