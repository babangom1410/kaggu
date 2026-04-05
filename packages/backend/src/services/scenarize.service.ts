import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import { initSSE, sendSSE } from './llm.service';

// Phase 1: single Sonnet call — reads PDFs + generates JSON structure in one pass (~15-25s total)
// Sonnet 4.6 handles PDFs natively and generates high-quality structured JSON
const MODEL_STRUCTURE = 'claude-sonnet-4-6';
// Phase 2: Sonnet for content generation — fast, parallel, cost-effective
const MODEL_CONTENT = 'claude-sonnet-4-6';
// Structure JSON for 4-8 modules ≈ 2-3k tokens with concise descriptions
const MAX_TOKENS_STRUCTURE = 4_000;
// Phase A: analyze document → CourseDocument
const MAX_TOKENS_ANALYZE = 2_500;
// Phase B v2: generate structure from CourseDocument (no PDF)
const MAX_TOKENS_STRUCTURE_V2 = 3_000;
// Step 2: HTML pages + quiz JSON per node (claude-sonnet-4-6 max = 16 000)
const MAX_TOKENS_CONTENT = 8_192;
// Max concurrent content-generation calls
const CONCURRENCY = 4;
// Max chars per text/markdown file before truncation (~7500 tokens)
const MAX_TEXT_FILE_CHARS = 30_000;
// Max words for contentContext injected into content calls
const MAX_CONTEXT_WORDS = 120;
// Hard cap on questions per quiz regardless of what Phase 1 returns
const MAX_QUESTIONS_PER_QUIZ = 8;
// Per-task API timeout (ms) — prevents a hung call from blocking the pool indefinitely
const CONTENT_TASK_TIMEOUT_MS = 90_000;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface CourseDocumentSection {
  name: string;
  contentSummary: string;
}

export interface CourseDocument {
  courseName: string;
  shortname: string;
  globalDescription: string;
  outcomes: string[];
  competencies: string[];
  sections: CourseDocumentSection[];
}

export interface StructureFromDocParams {
  courseDocument: CourseDocument;
  level: string;
  duration: string;
  moduleCount: number;
  language: string;
  additionalContext?: string;
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

// ─── Step 1: structure skeleton types ─────────────────────────────────────────

interface ScenNodeSkeleton {
  type: 'resource' | 'activity';
  subtype: string;
  name: string;
  description: string;  // full for assign/forum; brief for page/quiz
  questionCount?: number; // quiz only
  maxgrade?: number;      // assign only
  submissiontype?: 'online_text' | 'file' | 'both'; // assign only
  url?: string;           // url only
  completion?: number;
}

interface ScenBranchSkeleton {
  type: 'branch';
  conditionType: 'completion' | 'grade';
  gradeMin?: number;
  referenceNodeName: string;
  trueNode: ScenNodeSkeleton;
  falseNode: ScenNodeSkeleton;
}

type ScenSkeletonItem = ScenNodeSkeleton | ScenBranchSkeleton;

interface ScenSectionSkeleton {
  name: string;
  summary: string;
  contentContext: string; // short keyword list for this section
  nodes: ScenSkeletonItem[];
}

interface ScenStructure {
  courseName: string;
  shortname: string;
  summary: string;
  outcomes: string[];
  competencies: string[];
  sections: ScenSectionSkeleton[];
}

// ─── Step 2: enriched node (content added) ───────────────────────────────────

interface ScenNodeEnriched extends ScenNodeSkeleton {
  content?: string;    // page HTML
  questions?: unknown[]; // quiz questions
}

interface ScenBranchEnriched extends Omit<ScenBranchSkeleton, 'trueNode' | 'falseNode'> {
  trueNode: ScenNodeEnriched;
  falseNode: ScenNodeEnriched;
}

type ScenEnrichedItem = ScenNodeEnriched | ScenBranchEnriched;

interface ScenResult {
  courseName: string;
  shortname: string;
  summary: string;
  outcomes: string[];
  competencies: string[];
  sections: Array<Omit<ScenSectionSkeleton, 'nodes' | 'contentContext'> & { nodes: ScenEnrichedItem[] }>;
}

// ─── Mindmap shapes ────────────────────────────────────────────────────────────

interface Position { x: number; y: number }

interface MindmapNodeShape {
  id: string;
  type: string;
  position: Position;
  data: Record<string, unknown>;
}

interface MindmapEdgeShape {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let idSeed = 0;
function newId(prefix: string): string {
  idSeed++;
  return `${prefix}-${Date.now()}-${idSeed}`;
}

function newEdgeId(source: string, target: string, suffix = ''): string {
  return `edge-${source}-${target}${suffix}`;
}

function generateUUID(): string {
  return Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

function extractJsonBlock(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end > start ? text.slice(start, end + 1) : text.trim();
}

function extractJsonArray(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  return start !== -1 && end > start ? text.slice(start, end + 1) : text.trim();
}

// ─── Input guards ─────────────────────────────────────────────────────────────

/** Clamp a text to a max word count to keep context tokens bounded */
function truncateToWords(text: string, maxWords: number): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

/** Enforce contentContext limit on every section after structure parsing */
function guardStructure(s: ScenStructure): ScenStructure {
  return {
    ...s,
    sections: s.sections.map((sec) => ({
      ...sec,
      contentContext: truncateToWords(sec.contentContext ?? sec.summary, MAX_CONTEXT_WORDS),
    })),
  };
}

function injectQuizIds(questions: unknown[]): unknown[] {
  return (questions as Record<string, unknown>[]).map((q) => ({
    ...q,
    id: generateUUID(),
    answers: Array.isArray(q['answers'])
      ? (q['answers'] as Record<string, unknown>[]).map((a) => ({ ...a, id: generateUUID() }))
      : undefined,
  }));
}

/** Send a real SSE keepalive event every intervalMs — proxies cannot ignore real events */
function startHeartbeat(res: Response, intervalMs = 5_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      // Real SSE event (not a comment) — Caddy/nginx MUST forward it immediately
      sendSSE(res, 'keepalive', { ts: Date.now() });
    } catch { /* connection already closed */ }
  }, intervalMs);
}

/** Run tasks with a max concurrency limit, calling onDone after each */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onDone?: (index: number, result: T | null) => void,
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        const result = await tasks[idx]();
        results[idx] = result;
        onDone?.(idx, result);
      } catch (err) {
        console.error(`[scenarize:content] task-${idx} failed:`, (err as Error).message);
        results[idx] = null;
        onDone?.(idx, null);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** Race a promise against a timeout; throws if the timeout fires first */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

// ─── Phase 1: structure prompt (single Sonnet call) ───────────────────────────

function buildStructurePrompt(params: ScenarizationParams): string {
  return `Tu es un ingénieur pédagogique expert qui scénarise des formations Moodle.
PARAMÈTRES :
- Niveau : ${params.level}
- Durée : ${params.duration}
- Modules : ${params.moduleCount}
- Langue : ${params.language}
${params.additionalContext ? `- Instructions : ${params.additionalContext}` : ''}

Retourne UNIQUEMENT un JSON valide, sans texte, sans markdown. Sois TRÈS concis — max 3500 tokens au total.

{
  "courseName": "Titre complet",
  "shortname": "CODE10",
  "summary": "<p>1 phrase.</p>",
  "outcomes": ["Résultat 1", "Résultat 2"],
  "competencies": ["Compétence 1"],
  "sections": [
    {
      "name": "Module 1 : Titre",
      "summary": "1 phrase.",
      "contentContext": "mot-clé1, mot-clé2, mot-clé3, mot-clé4, mot-clé5",
      "nodes": [
        {
          "type": "resource",
          "subtype": "page",
          "name": "Titre",
          "description": "1 phrase.",
          "completion": 1
        },
        {
          "type": "activity",
          "subtype": "quiz",
          "name": "Quiz : Titre",
          "description": "1 phrase.",
          "questionCount": 4,
          "completion": 2
        },
        {
          "type": "activity",
          "subtype": "assign",
          "name": "Devoir : Titre",
          "description": "2 phrases max : tâche + livrable.",
          "maxgrade": 20,
          "submissiontype": "online_text",
          "completion": 2
        },
        {
          "type": "activity",
          "subtype": "forum",
          "name": "Discussion : Titre",
          "description": "1 phrase.",
          "completion": 1
        }
      ]
    }
  ]
}

RÈGLES STRICTES :
- "shortname" : max 10 caractères, MAJUSCULES, sans espaces
- "contentContext" : 5-8 mots-clés séparés par virgules (pas de phrases)
- Toutes les descriptions : max 2 phrases, max 30 mots chacune
- "questionCount" : entre 3 et ${MAX_QUESTIONS_PER_QUIZ} — JAMAIS plus
- Pas de champ "content" ni "questions" dans cette étape
- Exactement ${params.moduleCount} sections
- Activités : quiz, assign, forum | Ressources : page, url
- BranchNode uniquement si explicitement demandé`;
}

function buildAnalyzePrompt(params: ScenarizationParams): string {
  return `Tu es un ingénieur pédagogique expert.
PARAMÈTRES DE LA FORMATION :
- Niveau : ${params.level}
- Durée : ${params.duration}
- Nombre de modules : ${params.moduleCount}
- Langue de sortie : ${params.language}
${params.additionalContext ? `- Instructions : ${params.additionalContext}` : ''}

${params.files.length > 0 ? 'Analyse les fichiers fournis et génère' : 'Génère'} UNIQUEMENT ce JSON valide :

{
  "courseName": "Titre complet du cours",
  "shortname": "CODE10",
  "globalDescription": "5 à 8 phrases décrivant le cours, son contexte, sa valeur pédagogique et son public cible.",
  "outcomes": ["Résultat d'apprentissage mesurable 1", "Résultat 2", "Résultat 3"],
  "competencies": ["Compétence concrète 1", "Compétence 2"],
  "sections": [
    {
      "name": "Module 1 : Titre du module",
      "contentSummary": "80 à 100 mots décrivant fidèlement les concepts, notions et pratiques couverts dans ce module, tels qu'ils apparaissent dans les fichiers sources."
    }
  ]
}

RÈGLES STRICTES :
- Exactement ${params.moduleCount} sections
- "shortname" : max 10 caractères, MAJUSCULES, sans espaces
- "globalDescription" : 5-8 phrases complètes, riches en contenu
- "contentSummary" : fidèle au PDF — cite des notions concrètes, pas de généralités
- "outcomes" : 3 à 5 résultats mesurables et concrets
- "competencies" : 2 à 4 compétences pratiques`;
}

function buildStructureFromDocPrompt(params: StructureFromDocParams): string {
  const doc = params.courseDocument;
  const sectionsText = doc.sections
    .map((s, i) => `Module ${i + 1} — ${s.name} :\n${s.contentSummary}`)
    .join('\n\n');

  return `Tu es un ingénieur pédagogique expert qui conçoit des formations Moodle.

DOCUMENT DU COURS :
Titre : ${doc.courseName}
Description : ${doc.globalDescription}
Résultats attendus : ${doc.outcomes.join(' | ')}

CONTENU PAR MODULE :
${sectionsText}

PARAMÈTRES :
- Niveau : ${params.level}
- Durée : ${params.duration}
- Langue de sortie : ${params.language}
${params.additionalContext ? `- Instructions : ${params.additionalContext}` : ''}

Génère UNIQUEMENT ce JSON de structure Moodle :

{
  "sections": [
    {
      "name": "Module 1 : Titre",
      "summary": "1 phrase.",
      "nodes": [
        { "type": "resource", "subtype": "page", "name": "Titre de la page", "description": "1 phrase.", "completion": 1 },
        { "type": "activity", "subtype": "quiz", "name": "Quiz : Titre", "description": "1 phrase.", "questionCount": 4, "completion": 2 },
        { "type": "activity", "subtype": "assign", "name": "Devoir : Titre", "description": "2 phrases max : tâche + livrable.", "maxgrade": 20, "submissiontype": "online_text", "completion": 2 },
        { "type": "activity", "subtype": "forum", "name": "Discussion : Titre", "description": "1 phrase.", "completion": 1 }
      ]
    }
  ]
}

RÈGLES STRICTES :
- Exactement ${params.moduleCount} sections, dans le même ordre que les modules ci-dessus
- Toutes les descriptions : max 2 phrases, max 30 mots
- "questionCount" : entre 3 et ${MAX_QUESTIONS_PER_QUIZ} — JAMAIS plus
- Pas de champ "content" ni "questions"
- Activités : quiz, assign, forum | Ressources : page, url
- BranchNode uniquement si explicitement demandé dans les instructions`;
}

// ─── Step 2: content generation helpers ───────────────────────────────────────

const PAGE_SYSTEM = `Tu génères du contenu HTML pour une page de cours Moodle.
Règles : h2, h3, p, ul, ol, li, strong, em, hr uniquement — JAMAIS html/head/body/script/style.
Commence directement par le HTML, sans préambule. Contenu riche et pédagogique (4-8 paragraphes ou sections).`;

async function generatePageHtml(
  client: Anthropic,
  name: string,
  description: string,
  context: string,
  language: string,
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL_CONTENT,
    max_tokens: MAX_TOKENS_CONTENT,
    system: PAGE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Page : "${name}"\nObjectif : ${description}\nContenu source :\n${context}\nLangue : ${language}\n\nGénère le contenu HTML complet de cette page.`,
    }],
  });
  if (message.stop_reason === 'max_tokens') {
    console.warn(`[scenarize:page] "${name}" hit max_tokens — partial HTML returned`);
  }
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}

const QUIZ_SCHEMA = `[
  { "type": "multichoice", "text": "Question ?", "points": 1, "single": true,
    "answers": [{ "text": "Bonne", "correct": true, "feedback": "Correct." }, { "text": "Fausse", "correct": false, "feedback": "Non." }] },
  { "type": "truefalse", "text": "Affirmation.", "points": 1, "correct": true, "feedbackTrue": "Oui.", "feedbackFalse": "Non." },
  { "type": "shortanswer", "text": "Définissez X.", "points": 2, "answers": [{ "text": "réponse", "correct": true }] },
  { "type": "numerical", "text": "Calculez X.", "points": 1, "answer": 42, "tolerance": 0.5 }
]`;

async function generateQuizForScen(
  client: Anthropic,
  name: string,
  description: string,
  context: string,
  questionCount: number,
  language: string,
): Promise<unknown[]> {
  const message = await client.messages.create({
    model: MODEL_CONTENT,
    max_tokens: MAX_TOKENS_CONTENT,
    system: `Tu génères des questions de quiz Moodle en JSON strict.
Retourne UNIQUEMENT un tableau JSON valide (pas de texte, pas de markdown).
Types disponibles : multichoice, truefalse, shortanswer, numerical.
Format : ${QUIZ_SCHEMA}`,
    messages: [{
      role: 'user',
      content: `Quiz : "${name}" | Évalue : ${description}
Contenu source : ${context}
Langue : ${language}
Génère EXACTEMENT ${questionCount} questions variées. Retourne uniquement le tableau JSON.`,
    }],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  if (message.stop_reason === 'max_tokens') {
    console.warn(`[scenarize:quiz] "${name}" hit max_tokens — JSON likely truncated`);
  }
  try {
    const parsed = JSON.parse(extractJsonArray(raw)) as unknown[];
    return injectQuizIds(parsed);
  } catch (e) {
    console.error(`[scenarize:quiz] "${name}" parse error: ${(e as Error).message}`);
    console.error(`[scenarize:quiz] raw tail: ${raw.slice(-300)}`);
    return [];
  }
}

// ─── Phase 2 public interface ──────────────────────────────────────────────────

export interface ContentTask {
  nodeId: string;
  subtype: 'page' | 'quiz';
  name: string;
  description: string;
  contentContext: string;
  questionCount?: number;
}

export interface ContentGenerationParams {
  tasks: ContentTask[];
  language: string;
}

// ─── Mindmap conversion (same as before) ──────────────────────────────────────

function buildNodeData(item: ScenNodeEnriched): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: item.name,
    subtype: item.subtype,
    description: item.description ?? '',
    visible: true,
    completion: item.completion ?? (item.subtype === 'quiz' || item.subtype === 'assign' ? 2 : 1),
  };

  if (item.subtype === 'page') base.content = item.content ?? '';
  else if (item.subtype === 'url') base.url = item.url ?? '';
  else if (item.subtype === 'quiz') base.questions = item.questions ?? [];
  else if (item.subtype === 'assign') {
    base.maxgrade = item.maxgrade ?? 20;
    base.submissiontype = item.submissiontype ?? 'online_text';
  }

  return base;
}

function createNode(
  item: ScenNodeEnriched,
  nodes: MindmapNodeShape[],
  x: number,
  y: number,
  nameIndex: Map<string, string>,
): string {
  const id = newId('scen');
  nodes.push({ id, type: item.type, position: { x, y }, data: buildNodeData(item) });
  nameIndex.set(item.name, id);
  return id;
}

function scenarizationToMindmap(
  result: ScenResult,
  sectionContexts: Map<number, string>,
): {
  nodes: MindmapNodeShape[];
  edges: MindmapEdgeShape[];
  meta: { outcomes: string[]; competencies: string[]; courseName: string; summary: string };
} {
  const nodes: MindmapNodeShape[] = [];
  const edges: MindmapEdgeShape[] = [];

  const courseId = 'course-root';
  nodes.push({
    id: courseId,
    type: 'course',
    position: { x: 400, y: 80 },
    data: {
      fullname: result.courseName,
      shortname: result.shortname || result.courseName.replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase(),
      summary: result.summary ?? '',
      format: 'topics',
      visible: true,
      category: 1,
    },
  });

  const sectionCount = result.sections.length;
  const gap = sectionCount <= 3 ? 600 : sectionCount <= 5 ? 500 : 420;
  const totalW = (sectionCount - 1) * gap;
  const startX = 400 - totalW / 2;

  result.sections.forEach((section, sIdx) => {
    const sectionId = newId('scen-sec');
    const sx = startX + sIdx * gap;

    nodes.push({
      id: sectionId,
      type: 'section',
      position: { x: sx, y: 320 },
      data: { name: section.name, summary: section.summary, visible: true, contentContext: sectionContexts.get(sIdx) ?? '' },
    });
    edges.push({ id: newEdgeId(courseId, sectionId), source: courseId, target: sectionId });

    let currentY = 560;
    const nameIndex = new Map<string, string>();

    for (const item of section.nodes) {
      if (item.type === 'branch') {
        const branch = item as ScenBranchEnriched;
        const refId = nameIndex.get(branch.referenceNodeName);
        const parentId = refId ?? sectionId;

        const branchId = newId('scen-branch');
        nodes.push({
          id: branchId,
          type: 'branch',
          position: { x: sx, y: currentY },
          data: { conditionType: branch.conditionType, gradeMin: branch.gradeMin, referenceNodeId: refId ?? '' },
        });
        edges.push({ id: newEdgeId(parentId, branchId), source: parentId, target: branchId });

        const trueId = createNode(branch.trueNode, nodes, sx + 260, currentY, nameIndex);
        edges.push({ id: newEdgeId(branchId, trueId, '-t'), source: branchId, target: trueId, sourceHandle: 'source-true' });

        const falseId = createNode(branch.falseNode, nodes, sx, currentY + 180, nameIndex);
        edges.push({ id: newEdgeId(branchId, falseId, '-f'), source: branchId, target: falseId, sourceHandle: 'source-false' });

        currentY += 380;
      } else {
        const node = item as ScenNodeEnriched;
        const nodeId = createNode(node, nodes, sx, currentY, nameIndex);
        edges.push({ id: newEdgeId(sectionId, nodeId), source: sectionId, target: nodeId });
        currentY += 220;
      }
    }
  });

  return {
    nodes,
    edges,
    meta: {
      outcomes: result.outcomes ?? [],
      competencies: result.competencies ?? [],
      courseName: result.courseName,
      summary: result.summary ?? '',
    },
  };
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/** Phase A: reads PDFs + generates CourseDocument (title, description, outcomes, section summaries) */
export async function analyzeDocument(
  params: ScenarizationParams,
  res: Response,
): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const client = getClient();
  initSSE(res);
  const heartbeat = startHeartbeat(res);

  try {
    const hasFiles = params.files.length > 0;
    console.log(`[scenarize:analyze] START hasFiles=${hasFiles} files=${params.files.map(f => `${f.name}(${Math.round(f.content.length / 1000)}KB)`).join(',') || 'none'}`);

    sendSSE(res, 'progress', {
      step: 'analyze',
      message: hasFiles ? 'Lecture et analyse des documents…' : 'Analyse des paramètres de formation…',
    });

    const userContent: unknown[] = [];
    for (const file of params.files) {
      if (file.type === 'pdf') {
        userContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.content },
          title: file.name,
        });
      } else {
        userContent.push({ type: 'text', text: `## ${file.name}\n\n${file.content.slice(0, MAX_TEXT_FILE_CHARS)}` });
      }
    }
    userContent.push({
      type: 'text',
      text: hasFiles
        ? 'Analyse les fichiers ci-dessus et génère le document pédagogique JSON. Retourne UNIQUEMENT le JSON.'
        : 'Génère le document pédagogique JSON selon les paramètres. Retourne UNIQUEMENT le JSON.',
    });

    let docText = '';
    let firstDelta = true;

    console.log(`[scenarize:analyze] ${elapsed()} calling Anthropic API…`);
    const stream = client.messages.stream({
      model: MODEL_STRUCTURE,
      max_tokens: MAX_TOKENS_ANALYZE,
      system: buildAnalyzePrompt(params),
      messages: [{ role: 'user', content: userContent as Anthropic.ContentBlockParam[] }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (firstDelta) {
          console.log(`[scenarize:analyze] ${elapsed()} first delta received`);
          firstDelta = false;
        }
        docText += event.delta.text;
        sendSSE(res, 'delta', { text: event.delta.text });
      }
    }

    console.log(`[scenarize:analyze] ${elapsed()} stream complete — ${docText.length} chars`);

    const finalMsg = await stream.finalMessage();
    if (finalMsg.stop_reason === 'max_tokens') {
      sendSSE(res, 'error', {
        message: 'Analyse tronquée (limite de tokens). Réduis le nombre de fichiers ou de modules.',
      });
      return;
    }

    const jsonText = extractJsonBlock(docText);
    let courseDocument: CourseDocument;
    try {
      courseDocument = JSON.parse(jsonText) as CourseDocument;
      if (!courseDocument.sections || courseDocument.sections.length === 0) {
        throw new Error('Aucune section générée');
      }
    } catch (e) {
      console.error('[scenarize:analyze] parse error:', (e as Error).message);
      sendSSE(res, 'error', { message: `Document JSON invalide : ${(e as Error).message}` });
      return;
    }

    console.log(`[scenarize:analyze] ${elapsed()} sending done — ${courseDocument.sections.length} sections`);
    sendSSE(res, 'done', { courseDocument });

  } catch (err) {
    console.error(`[scenarize:analyze] ${elapsed()} ERROR:`, (err as Error).message);
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    clearInterval(heartbeat);
    res.end();
    console.log(`[scenarize:analyze] res.end() called`);
  }
}

/** Phase B: takes CourseDocument + params → generates mindmap structure (no PDF) */
export async function scenarizeCourseFromDocument(
  params: StructureFromDocParams,
  res: Response,
): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const client = getClient();
  initSSE(res);
  const heartbeat = startHeartbeat(res);

  try {
    console.log(`[scenarize:structure] START from courseDocument "${params.courseDocument.courseName}"`);

    sendSSE(res, 'progress', {
      step: 'structure',
      message: 'Génération de la structure du parcours…',
    });

    let structureText = '';
    let firstDelta = true;

    console.log(`[scenarize:structure] ${elapsed()} calling Anthropic API…`);
    const stream = client.messages.stream({
      model: MODEL_STRUCTURE,
      max_tokens: MAX_TOKENS_STRUCTURE_V2,
      system: buildStructureFromDocPrompt(params),
      messages: [{
        role: 'user',
        content: 'Génère la structure JSON du mindmap Moodle pour ce cours. Retourne UNIQUEMENT le JSON.',
      }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (firstDelta) {
          console.log(`[scenarize:structure] ${elapsed()} first delta received`);
          firstDelta = false;
        }
        structureText += event.delta.text;
        sendSSE(res, 'delta', { text: event.delta.text });
      }
    }

    console.log(`[scenarize:structure] ${elapsed()} stream complete — ${structureText.length} chars`);

    const finalMsg = await stream.finalMessage();
    if (finalMsg.stop_reason === 'max_tokens') {
      sendSSE(res, 'error', {
        message: 'Structure tronquée. Réduis le nombre de modules et réessaie.',
      });
      return;
    }

    interface StructureSectionJSON {
      name: string;
      summary: string;
      nodes: ScenSkeletonItem[];
    }
    interface StructureJSON {
      sections: StructureSectionJSON[];
    }

    const jsonText = extractJsonBlock(structureText);
    let structureJSON: StructureJSON;
    try {
      structureJSON = JSON.parse(jsonText) as StructureJSON;
      if (!structureJSON.sections?.length) throw new Error('Aucune section dans la structure');
    } catch (e) {
      const trimmed = jsonText.trimEnd();
      const isTruncated = trimmed.length > 50 && !trimmed.endsWith('}');
      console.error('[scenarize:structure] parse error:', (e as Error).message);
      sendSSE(res, 'error', {
        message: isTruncated
          ? 'Structure tronquée. Réduis le nombre de modules et réessaie.'
          : `Structure JSON invalide : ${(e as Error).message}`,
      });
      return;
    }

    const doc = params.courseDocument;
    const skeleton: ScenResult = {
      courseName: doc.courseName,
      shortname: doc.shortname || doc.courseName.replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase(),
      summary: doc.globalDescription,
      outcomes: doc.outcomes ?? [],
      competencies: doc.competencies ?? [],
      sections: structureJSON.sections.map((s) => ({
        name: s.name,
        summary: s.summary ?? '',
        nodes: (s.nodes ?? []).map((item) => {
          if (item.type === 'branch') {
            return {
              ...item,
              trueNode: { ...item.trueNode, content: undefined, questions: undefined } as ScenNodeEnriched,
              falseNode: { ...item.falseNode, content: undefined, questions: undefined } as ScenNodeEnriched,
            } as ScenBranchEnriched;
          }
          const node = item as ScenNodeSkeleton;
          const enriched: ScenNodeEnriched = { ...node };
          if (node.subtype === 'page') enriched.content = '';
          else if (node.subtype === 'quiz') enriched.questions = [];
          return enriched;
        }),
      })),
    };

    const sectionContexts = new Map<number, string>();
    doc.sections.forEach((s, idx) => {
      sectionContexts.set(idx, s.contentSummary ?? '');
    });

    sendSSE(res, 'progress', { step: 'converting', message: 'Conversion en mindmap…' });
    const { nodes, edges, meta } = scenarizationToMindmap(skeleton, sectionContexts);

    const donePayload = JSON.stringify({ nodes, edges, meta });
    console.log(`[scenarize:structure] ${elapsed()} sending done — payload ${Math.round(donePayload.length / 1000)}KB`);
    sendSSE(res, 'done', { nodes, edges, meta });

  } catch (err) {
    console.error(`[scenarize:structure] ${elapsed()} ERROR:`, (err as Error).message);
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    clearInterval(heartbeat);
    res.end();
    console.log(`[scenarize:structure] res.end() called`);
  }
}

/** Phase 1: single Sonnet call — reads PDFs + generates JSON structure in one pass */
export async function scenarizeCourseStructure(
  params: ScenarizationParams,
  res: Response,
): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const client = getClient();
  initSSE(res);

  const heartbeat = startHeartbeat(res);

  try {
    const hasFiles = params.files.length > 0;
    console.log(`[scenarize:structure] START hasFiles=${hasFiles} files=${params.files.map(f => `${f.name}(${Math.round(f.content.length / 1000)}KB)`).join(',') || 'none'}`);

    sendSSE(res, 'progress', {
      step: 'structure',
      message: hasFiles ? 'Analyse des documents et structuration du cours…' : 'Génération de la structure du cours…',
    });

    // Build user content: PDFs as document blocks + text files inline + instruction
    const userContent: unknown[] = [];

    for (const file of params.files) {
      if (file.type === 'pdf') {
        userContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.content },
          title: file.name,
        });
      } else {
        userContent.push({ type: 'text', text: `## ${file.name}\n\n${file.content.slice(0, MAX_TEXT_FILE_CHARS)}` });
      }
    }

    userContent.push({
      type: 'text',
      text: hasFiles
        ? 'Analyse les fichiers ci-dessus et génère la structure JSON du cours. Retourne UNIQUEMENT le JSON.'
        : 'Génère la structure JSON du cours selon les paramètres. Retourne UNIQUEMENT le JSON.',
    });

    let structureText = '';
    let firstDelta = true;

    {
      console.log(`[scenarize:structure] ${elapsed()} calling Anthropic API…`);
      const stream = client.messages.stream({
        model: MODEL_STRUCTURE,
        max_tokens: MAX_TOKENS_STRUCTURE,
        system: buildStructurePrompt(params),
        messages: [{ role: 'user', content: userContent as Anthropic.ContentBlockParam[] }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          if (firstDelta) {
            console.log(`[scenarize:structure] ${elapsed()} first delta received`);
            firstDelta = false;
          }
          structureText += event.delta.text;
          sendSSE(res, 'delta', { text: event.delta.text });
        }
      }

      console.log(`[scenarize:structure] ${elapsed()} stream complete — ${structureText.length} chars`);

      const finalMsg = await stream.finalMessage();
      if (finalMsg.stop_reason === 'max_tokens') {
        sendSSE(res, 'error', {
          message: 'Réponse tronquée (limite de tokens atteinte). Réduis le nombre de modules ou de fichiers et réessaie.',
        });
        return;
      }
    }

    // Parse structure
    let structure: ScenStructure;
    const jsonText = extractJsonBlock(structureText);
    try {
      structure = guardStructure(JSON.parse(jsonText) as ScenStructure);
    } catch (e) {
      // Check truncation on the EXTRACTED json, not the raw text
      // (raw text may end with ``` from markdown fences, not })
      const trimmed = jsonText.trimEnd();
      const isTruncated = trimmed.length > 50 && !trimmed.endsWith('}');
      console.error('[scenarize:structure] parse error:', (e as Error).message);
      console.error('[scenarize:structure] extracted end:', trimmed.slice(-150));
      sendSSE(res, 'error', {
        message: isTruncated
          ? 'Structure tronquée. Réduis le nombre de modules et réessaie.'
          : `Structure JSON invalide : ${(e as Error).message}`,
      });
      return;
    }

    // Build a skeleton result with empty content for page/quiz nodes
    const skeleton: ScenResult = {
      ...structure,
      sections: structure.sections.map((s) => ({
        name: s.name,
        summary: s.summary,
        nodes: s.nodes.map((item) => {
          if (item.type === 'branch') {
            return {
              ...item,
              trueNode: { ...item.trueNode, content: undefined, questions: undefined } as ScenNodeEnriched,
              falseNode: { ...item.falseNode, content: undefined, questions: undefined } as ScenNodeEnriched,
            } as ScenBranchEnriched;
          }
          const node = item as ScenNodeSkeleton;
          const enriched: ScenNodeEnriched = { ...node };
          if (node.subtype === 'page') enriched.content = '';
          else if (node.subtype === 'quiz') enriched.questions = [];
          return enriched;
        }),
      })),
    };

    // Build a map from section index → contentContext for the mindmap conversion
    const sectionContexts = new Map<number, string>();
    structure.sections.forEach((s, idx) => {
      sectionContexts.set(idx, s.contentContext ?? '');
    });

    // ── PHASE 2 (skipped): convert to mindmap ─────────────────────────────────

    sendSSE(res, 'progress', { step: 'converting', message: 'Conversion en mindmap…' });

    const { nodes, edges, meta } = scenarizationToMindmap(skeleton, sectionContexts);
    const donePayload = JSON.stringify({ nodes, edges, meta });
    console.log(`[scenarize:structure] ${elapsed()} sending done event — payload ${Math.round(donePayload.length / 1000)}KB`);
    sendSSE(res, 'done', { nodes, edges, meta });
    console.log(`[scenarize:structure] ${elapsed()} done event sent — res.writableEnded=${res.writableEnded}`);

  } catch (err) {
    console.error(`[scenarize:structure] ${elapsed()} ERROR:`, (err as Error).message);
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    clearInterval(heartbeat);
    res.end();
    console.log(`[scenarize:structure] ${elapsed()} res.end() called`);
  }
}

/** Backward-compatible alias */
export const scenarizeCourse = scenarizeCourseStructure;

/** Phase 2: Generate HTML + quiz questions for all page/quiz nodes with empty content */
export async function scenarizeContent(
  params: ContentGenerationParams,
  res: Response,
): Promise<void> {
  const client = getClient();
  initSSE(res);

  const heartbeat = startHeartbeat(res);

  try {
    const total = params.tasks.length;

    sendSSE(res, 'progress', {
      step: 'content',
      message: `Génération du contenu (${total} nœuds)…`,
      total,
      done: 0,
    });

    interface NodeDoneResult {
      nodeId: string;
      content?: string;
      questions?: unknown[];
    }

    const results: NodeDoneResult[] = [];
    let doneCount = 0;

    const taskFns = params.tasks.map((task, taskIdx) => async () => {
      const context = truncateToWords(task.contentContext || '', MAX_CONTEXT_WORDS);
      const result: NodeDoneResult = { nodeId: task.nodeId };

      if (task.subtype === 'page') {
        const html = await withTimeout(
          generatePageHtml(client, task.name, task.description, context, params.language),
          CONTENT_TASK_TIMEOUT_MS,
          `page "${task.name}"`,
        );
        result.content = html;
      } else if (task.subtype === 'quiz') {
        const count = Math.min(task.questionCount ?? 5, MAX_QUESTIONS_PER_QUIZ);
        const questions = await withTimeout(
          generateQuizForScen(client, task.name, task.description, context, count, params.language),
          CONTENT_TASK_TIMEOUT_MS,
          `quiz "${task.name}"`,
        );
        result.questions = questions;
      }

      doneCount++;
      results[taskIdx] = result;

      sendSSE(res, 'node_done', {
        nodeId: task.nodeId,
        name: task.name,
        type: task.subtype,
        content: result.content,
        questions: result.questions,
        index: doneCount,
        total,
      });
    });

    await withConcurrency(taskFns, CONCURRENCY);

    sendSSE(res, 'done', { results });

  } catch (err) {
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
