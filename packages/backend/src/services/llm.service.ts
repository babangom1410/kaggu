import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

export function initSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

export function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── System prompts ───────────────────────────────────────────────────────────

const SYSTEM_BASE = `Tu es un assistant pédagogique expert pour la plateforme Kàggu.
Tu aides les enseignants à concevoir des cours Moodle de qualité.
Tes réponses sont concises, structurées et directement utilisables.
Tu t'exprimes en français sauf si l'enseignant utilise une autre langue.`;

// ─── Generate node content ────────────────────────────────────────────────────

export interface GenerateContentParams {
  nodeType: 'course' | 'section' | 'resource' | 'activity';
  nodeSubtype?: string;
  nodeName: string;
  prompt: string;
  courseContext?: string;
}

export async function generateNodeContent(
  params: GenerateContentParams,
  res: Response,
): Promise<void> {
  const client = getClient();

  const typeDescriptions: Record<string, string> = {
    course:   'le cours entier',
    section:  'une section du cours',
    resource: `une ressource de type ${params.nodeSubtype ?? 'page'}`,
    activity: `une activité de type ${params.nodeSubtype ?? 'devoir'}`,
  };

  const systemPrompt = `${SYSTEM_BASE}

L'enseignant travaille sur ${typeDescriptions[params.nodeType]} nommé "${params.nodeName}".
${params.courseContext ? `Contexte du cours : ${params.courseContext}` : ''}

Tu peux générer : descriptions HTML, questions de quiz (format JSON), énoncés d'exercices, résumés.
Pour les quiz, retourne un JSON valide avec la structure :
{"questions": [{"text": "...", "type": "mcq|truefalse|short", "choices": ["..."], "answer": "..."}]}`;

  initSSE(res);

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: params.prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sendSSE(res, 'delta', { text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    sendSSE(res, 'done', {
      input_tokens:  final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
    });
  } catch (err) {
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    res.end();
  }
}

// ─── Generate course structure ────────────────────────────────────────────────

export interface CourseStructureParams {
  description: string;
}

export async function generateCourseStructure(
  params: CourseStructureParams,
  res: Response,
): Promise<void> {
  const client = getClient();

  const systemPrompt = `${SYSTEM_BASE}

Tu génères des structures de cours Moodle au format JSON strict.
Le format de sortie doit être EXACTEMENT :
{
  "courseName": "...",
  "sections": [
    {
      "name": "...",
      "summary": "...",
      "nodes": [
        {
          "type": "activity|resource",
          "subtype": "quiz|assign|forum|url|page",
          "name": "...",
          "intro": "..."
        }
      ]
    }
  ]
}
Retourne UNIQUEMENT le JSON, sans texte avant ni après.`;

  initSSE(res);

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Génère une structure de cours Moodle pour : ${params.description}`,
      }],
    });

    let fullText = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        sendSSE(res, 'delta', { text: event.delta.text });
      }
    }

    // Extract JSON even if Claude wrapped it in markdown code fences
    try {
      const start = fullText.indexOf('{');
      const end = fullText.lastIndexOf('}');
      const jsonText = start !== -1 && end > start ? fullText.slice(start, end + 1) : fullText.trim();
      const parsed = JSON.parse(jsonText);
      sendSSE(res, 'done', { structure: parsed });
    } catch {
      sendSSE(res, 'done', { raw: fullText });
    }
  } catch (err) {
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    res.end();
  }
}

// ─── Generate HTML page content ──────────────────────────────────────────────

export interface GenerateHtmlParams {
  nodeName: string;
  prompt: string;
  existingContent?: string;
}

export async function generateHtmlContent(
  params: GenerateHtmlParams,
  res: Response,
): Promise<void> {
  const client = getClient();

  const systemPrompt = `${SYSTEM_BASE}

Tu génères du contenu HTML propre pour une ressource Page Moodle.
Règles strictes :
- Utilise uniquement des balises HTML sémantiques : h2, h3, p, ul, ol, li, strong, em, a, hr, table, td, th
- N'utilise PAS de balises html, head, body, script ou style
- N'utilise PAS de classes CSS ni d'attributs style inline
- Le contenu doit être directement utilisable dans TinyMCE Moodle
- Commence directement par le contenu HTML, sans préambule ni explication
- Nom de la ressource : "${params.nodeName}"
${params.existingContent ? `\nContenu existant (contexte ou à améliorer) :\n${params.existingContent}` : ''}`;

  initSSE(res);

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: params.prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sendSSE(res, 'delta', { text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    sendSSE(res, 'done', {
      input_tokens:  final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
    });
  } catch (err) {
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    res.end();
  }
}

// ─── Analyze mindmap coherence ────────────────────────────────────────────────

export interface AnalyzeParams {
  mindmapSummary: string;
}

export async function analyzeMindmap(
  params: AnalyzeParams,
  res: Response,
): Promise<void> {
  const client = getClient();

  const systemPrompt = `${SYSTEM_BASE}

Tu analyses des structures de cours Moodle et identifies :
1. Les activités manquantes (évaluations, introductions, etc.)
2. Les incohérences pédagogiques
3. Les améliorations suggérées

Format de réponse : liste à puces claire et actionnable.`;

  initSSE(res);

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Analyse cette structure de cours et donne tes suggestions :\n\n${params.mindmapSummary}`,
      }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sendSSE(res, 'delta', { text: event.delta.text });
      }
    }

    sendSSE(res, 'done', {});
  } catch (err) {
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    res.end();
  }
}
