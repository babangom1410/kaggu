import { supabase } from '@/lib/supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

export type SSECallback = (event: string, data: unknown) => void;

async function streamPost(path: string, body: unknown, onEvent: SSECallback): Promise<void> {
  const token = await getToken();

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
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

export function generateContent(params: GenerateParams, onEvent: SSECallback) {
  return streamPost('/api/v1/llm/generate', params, onEvent);
}

export function generateCourseStructure(description: string, onEvent: SSECallback) {
  return streamPost('/api/v1/llm/course-structure', { description }, onEvent);
}

export function analyzeMindmap(mindmapSummary: string, onEvent: SSECallback) {
  return streamPost('/api/v1/llm/analyze', { mindmapSummary }, onEvent);
}
