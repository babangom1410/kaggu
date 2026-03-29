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

// ─── JSON extraction helpers ──────────────────────────────────────────────────

function extractJsonBlock(text: string, startChar: '{' | '['): string {
  // Strip markdown code fences first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const endChar = startChar === '{' ? '}' : ']';
  const start = text.indexOf(startChar);
  const end = text.lastIndexOf(endChar);
  return start !== -1 && end > start ? text.slice(start, end + 1) : text.trim();
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
      const jsonText = extractJsonBlock(fullText, '{');
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

// ─── Generate quiz questions ──────────────────────────────────────────────────

export interface CourseContentSource {
  nodeId: string;
  label: string;   // node name (for context)
  content: string; // text/HTML content
}

export interface GenerateQuizParams {
  quizName: string;
  prompt: string;
  questionCount: number;
  questionTypes: ('multichoice' | 'truefalse' | 'shortanswer' | 'numerical')[];
  courseContent: CourseContentSource[];
}

const QUIZ_JSON_SCHEMA = `[
  {
    "id": "<uuid>",
    "type": "multichoice",
    "text": "<question HTML>",
    "points": 1,
    "single": true,
    "answers": [
      { "id": "<uuid>", "text": "...", "correct": true,  "feedback": "..." },
      { "id": "<uuid>", "text": "...", "correct": false, "feedback": "..." }
    ],
    "generalfeedback": "..."
  },
  {
    "id": "<uuid>",
    "type": "truefalse",
    "text": "<question>",
    "points": 1,
    "correct": true,
    "feedbackTrue": "...",
    "feedbackFalse": "...",
    "generalfeedback": "..."
  },
  {
    "id": "<uuid>",
    "type": "shortanswer",
    "text": "<question>",
    "points": 1,
    "answers": [{ "id": "<uuid>", "text": "<accepted answer>", "feedback": "..." }],
    "generalfeedback": "..."
  },
  {
    "id": "<uuid>",
    "type": "numerical",
    "text": "<question>",
    "points": 1,
    "answer": 42,
    "tolerance": 0.5,
    "generalfeedback": "..."
  }
]`;

function generateUUID(): string {
  return Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

function injectUUIDs(questions: unknown[]): unknown[] {
  return questions.map((q: unknown) => {
    const question = q as Record<string, unknown>;
    const result: Record<string, unknown> = { ...question, id: question.id || generateUUID() };
    if (Array.isArray(result['answers'])) {
      result['answers'] = (result['answers'] as unknown[]).map((a: unknown) => {
        const answer = a as Record<string, unknown>;
        return { ...answer, id: answer['id'] || generateUUID() };
      });
    }
    return result;
  });
}

export async function generateQuizQuestions(
  params: GenerateQuizParams,
): Promise<{ questions: unknown[]; input_tokens: number; output_tokens: number }> {
  const client = getClient();

  const contentBlock = params.courseContent.length > 0
    ? params.courseContent
        .map((s) => `### ${s.label}\n${s.content}`)
        .join('\n\n')
    : null;

  const typesList = params.questionTypes.join(', ');

  const systemPrompt = `${SYSTEM_BASE}

Tu génères des questions de quiz Moodle au format JSON strict.
Quiz : "${params.quizName}"
Nombre de questions demandées : ${params.questionCount}
Types autorisés : ${typesList}

Règles :
- Retourne UNIQUEMENT un tableau JSON valide, sans texte avant ni après, sans blocs markdown
- Chaque question doit avoir un "id" unique (chaîne alphanumérique)
- Chaque réponse (multichoice, shortanswer) doit avoir un "id" unique
- Pour "multichoice" avec plusieurs bonnes réponses, utilise "single": false
- Les textes de questions peuvent contenir du HTML simple (strong, em, code)
- Rédige dans la langue du contenu source ou du prompt

Format JSON attendu :
${QUIZ_JSON_SCHEMA}`;

  const userMessage = [
    params.prompt,
    contentBlock ? `\n\nContenu source à utiliser :\n\n${contentBlock}` : '',
  ].join('');

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  // Strip markdown fences if present
  const jsonText = extractJsonBlock(raw, '[');

  let questions: unknown[];
  try {
    questions = JSON.parse(jsonText) as unknown[];
  } catch {
    throw new Error(`Claude did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    questions: injectUUIDs(questions),
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };
}

// ─── Generate feedback items ──────────────────────────────────────────────────

export interface GenerateFeedbackParams {
  feedbackName: string;
  prompt: string;
  itemCount?: number;
}

const FEEDBACK_ITEM_SCHEMA = `[
  { "type": "text",     "name": "Votre prénom ?",           "required": true },
  { "type": "multichoice", "name": "Niveau de difficulté ?", "required": true,  "options": ["Très facile", "Facile", "Difficile", "Très difficile"] },
  { "type": "textarea", "name": "Commentaires libres ?",     "required": false }
]`;

export async function generateFeedbackItems(
  params: GenerateFeedbackParams,
): Promise<{ items: unknown[]; input_tokens: number; output_tokens: number }> {
  const client = getClient();

  const itemCount = params.itemCount ?? 5;

  const systemPrompt = `${SYSTEM_BASE}

Tu génères des items de sondage/questionnaire Moodle (module Feedback) au format JSON strict.
Questionnaire : "${params.feedbackName}"
Nombre d'items demandés : ${itemCount}

Types d'items disponibles : text, textarea, multichoice, multichoice_rated, numeric, label, info, pagebreak
- "text"             : champ texte court
- "textarea"         : champ texte long
- "multichoice"      : choix parmi options (propriété "options": ["..."])
- "multichoice_rated": choix noté (propriété "options": ["..."])
- "numeric"          : valeur numérique (propriétés "min" et "max")
- "label"            : texte non interactif (titre de section)
- "info"             : texte informatif
- "pagebreak"        : saut de page

Règles :
- Retourne UNIQUEMENT un tableau JSON valide, sans texte avant ni après
- Chaque item doit avoir : "type", "name" (intitulé), "required" (boolean)
- Les items multichoice doivent avoir "options": ["..."]
- Les items numeric doivent avoir "min" et "max"

Format JSON attendu :
${FEEDBACK_ITEM_SCHEMA}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: params.prompt }],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const jsonText = extractJsonBlock(raw, '[');

  let items: unknown[];
  try {
    items = JSON.parse(jsonText) as unknown[];
  } catch {
    throw new Error(`Claude did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  // Inject IDs
  const withIds = items.map((item: unknown) => {
    const it = item as Record<string, unknown>;
    return { ...it, id: `ai-fi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
  });

  return {
    items: withIds,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };
}

// ─── Generate lesson pages ────────────────────────────────────────────────────

export interface GenerateLessonParams {
  lessonName: string;
  prompt: string;
  pageCount?: number;
  pageTypes?: ('content' | 'multichoice' | 'truefalse' | 'shortanswer')[];
}

const LESSON_PAGE_SCHEMA = `[
  {
    "title": "Introduction",
    "type": "content",
    "content": "<h2>Introduction</h2><p>...</p>"
  },
  {
    "title": "Question : Qu'est-ce que X ?",
    "type": "multichoice",
    "content": "<p>Qu'est-ce que X ?</p>",
    "answers": [
      { "text": "Réponse correcte", "correct": true,  "response": "Exact !", "jumpto": -1 },
      { "text": "Réponse incorrecte", "correct": false, "response": "Pas tout à fait.",  "jumpto": 0 }
    ]
  },
  {
    "title": "Vrai ou Faux",
    "type": "truefalse",
    "content": "<p>Affirmation à évaluer.</p>",
    "answers": [
      { "text": "Vrai", "correct": true,  "response": "Correct !", "jumpto": -1 },
      { "text": "Faux", "correct": false, "response": "Incorrect.", "jumpto": 0  }
    ]
  }
]`;

export async function generateLessonPages(
  params: GenerateLessonParams,
): Promise<{ pages: unknown[]; input_tokens: number; output_tokens: number }> {
  const client = getClient();

  const pageCount = params.pageCount ?? 5;
  const pageTypes = (params.pageTypes ?? ['content', 'multichoice']).join(', ');

  const systemPrompt = `${SYSTEM_BASE}

Tu génères des pages de leçon Moodle (module Lesson) au format JSON strict.
Leçon : "${params.lessonName}"
Nombre de pages demandées : ${pageCount}
Types de pages autorisés : ${pageTypes}

Types de pages :
- "content"     : page de contenu pur (pas de réponses), "content" contient du HTML pédagogique
- "multichoice" : question à choix multiples, "answers" obligatoire avec au moins 2 réponses
- "truefalse"   : vrai/faux, "answers" obligatoire avec EXACTEMENT 2 réponses (Vrai / Faux)
- "shortanswer" : réponse courte, "answers" obligatoire avec au moins 1 réponse acceptée

Règles :
- Retourne UNIQUEMENT un tableau JSON valide, sans texte avant ni après
- Chaque page a : "title" (string), "type", "content" (HTML), "answers" (si applicable)
- "content" HTML : h2, h3, p, ul, ol, li, strong, em, hr uniquement — PAS de balises html/head/body/script
- "answers[].jumpto" : -1 = page suivante, -2 = fin de leçon, 0 = cette page
- Alterne entre pages de contenu et pages de questions pour un parcours interactif

Format JSON attendu :
${LESSON_PAGE_SCHEMA}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: params.prompt }],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const jsonText = extractJsonBlock(raw, '[');

  let pages: unknown[];
  try {
    pages = JSON.parse(jsonText) as unknown[];
  } catch {
    throw new Error(`Claude did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  const withIds = pages.map((p: unknown) => {
    const page = p as Record<string, unknown>;
    const pageId = `ai-lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const answers = Array.isArray(page['answers'])
      ? (page['answers'] as unknown[]).map((a: unknown) => ({
          ...(a as Record<string, unknown>),
          id: `ai-la-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        }))
      : [];
    return { ...page, id: pageId, answers };
  });

  return {
    pages: withIds,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };
}

// ─── Generate book chapters ───────────────────────────────────────────────────

export interface GenerateBookParams {
  bookName: string;
  prompt: string;
  chapterCount?: number;
}

const BOOK_CHAPTER_SCHEMA = `[
  { "title": "Introduction",     "content": "<h2>Introduction</h2><p>...</p>", "subchapter": false },
  { "title": "Concepts clés",    "content": "<p>...</p>",                      "subchapter": false },
  { "title": "Sous-section 2.1", "content": "<p>...</p>",                      "subchapter": true  }
]`;

export async function generateBookChapters(
  params: GenerateBookParams,
): Promise<{ chapters: unknown[]; input_tokens: number; output_tokens: number }> {
  const client = getClient();

  const chapterCount = params.chapterCount ?? 6;

  const systemPrompt = `${SYSTEM_BASE}

Tu génères des chapitres de livre Moodle (module Book) au format JSON strict.
Livre : "${params.bookName}"
Nombre de chapitres demandés : ${chapterCount}

Règles :
- Retourne UNIQUEMENT un tableau JSON valide, sans texte avant ni après
- Chaque chapitre a : "title" (string), "content" (HTML), "subchapter" (boolean)
- "subchapter": true = sous-chapitre indenté (section d'un chapitre principal)
- "content" HTML : h2, h3, p, ul, ol, li, strong, em, hr, table uniquement — PAS de balises html/head/body/script
- Commence par un chapitre d'introduction, termine par une synthèse ou conclusion
- Les sous-chapitres doivent suivre immédiatement leur chapitre parent

Format JSON attendu :
${BOOK_CHAPTER_SCHEMA}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: params.prompt }],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const jsonText = extractJsonBlock(raw, '[');

  let chapters: unknown[];
  try {
    chapters = JSON.parse(jsonText) as unknown[];
  } catch {
    throw new Error(`Claude did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  const withIds = chapters.map((c: unknown) => ({
    ...(c as Record<string, unknown>),
    id: `ai-ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  }));

  return {
    chapters: withIds,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };
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
