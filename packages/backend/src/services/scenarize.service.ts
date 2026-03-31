import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import { initSSE, sendSSE } from './llm.service';

// Phase 1: Opus for best PDF understanding + pedagogical structure quality (1 call only)
const MODEL_STRUCTURE = 'claude-opus-4-6';
// Phase 2: Sonnet for content generation — fast, parallel, cost-effective
const MODEL_CONTENT = 'claude-sonnet-4-6';
// Step 1: structure skeleton output — no HTML, no questions → bounded but can grow with many modules
const MAX_TOKENS_STRUCTURE = 16000;
// Step 2: content per node — bounded per call
const MAX_TOKENS_CONTENT = 2048;
// Max concurrent content-generation calls
const CONCURRENCY = 4;
// Max chars per text/markdown file before truncation (~7500 tokens)
const MAX_TEXT_FILE_CHARS = 30_000;
// Max words for contentContext injected into content calls
const MAX_CONTEXT_WORDS = 120;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

// ─── Public interface ─────────────────────────────────────────────────────────

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
  objectives: string[];
  contentContext: string; // 150-word extract of PDF content for this section
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

/** Send SSE comment (keep-alive ping) to prevent proxy timeouts */
function startHeartbeat(res: Response, intervalMs = 20_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { /* connection already closed */ }
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
        console.error(`[scenarize:content] task ${idx} failed:`, (err as Error).message);
        results[idx] = null;
        onDone?.(idx, null);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ─── Step 1: structure-only prompt ────────────────────────────────────────────

function buildStructurePrompt(params: ScenarizationParams): string {
  return `Tu es un ingénieur pédagogique expert qui scénarise des formations Moodle.
PARAMÈTRES :
- Niveau : ${params.level}
- Durée : ${params.duration}
- Modules : ${params.moduleCount}
- Langue : ${params.language}
${params.additionalContext ? `- Instructions : ${params.additionalContext}` : ''}

Retourne UNIQUEMENT un JSON valide, sans texte, sans markdown, avec cette structure :

{
  "courseName": "Titre complet",
  "shortname": "CODE10",
  "summary": "<p>2 phrases de description.</p>",
  "outcomes": ["Résultat 1", "Résultat 2", "Résultat 3"],
  "competencies": ["Compétence 1", "Compétence 2"],
  "sections": [
    {
      "name": "Module 1 : Titre",
      "summary": "1 phrase résumé.",
      "objectives": ["Objectif 1", "Objectif 2"],
      "contentContext": "Résumé en 150 mots max du contenu des fichiers pour ce module. Inclure les concepts clés, définitions importantes, et points pédagogiques essentiels. Ce texte servira à générer le contenu détaillé.",
      "nodes": [
        {
          "type": "resource",
          "subtype": "page",
          "name": "Titre de la page",
          "description": "1 phrase décrivant ce que couvre cette page.",
          "completion": 1
        },
        {
          "type": "activity",
          "subtype": "quiz",
          "name": "Quiz : Titre",
          "description": "1 phrase sur ce qui est évalué.",
          "questionCount": 4,
          "completion": 2
        },
        {
          "type": "activity",
          "subtype": "assign",
          "name": "Devoir : Titre",
          "description": "Énoncé complet du devoir en 3 phrases : contexte, tâche demandée, livrable attendu.",
          "maxgrade": 20,
          "submissiontype": "online_text",
          "completion": 2
        },
        {
          "type": "activity",
          "subtype": "forum",
          "name": "Discussion : Titre",
          "description": "Question de discussion en 2 phrases avec le contexte pédagogique.",
          "completion": 1
        }
      ]
    }
  ]
}

RÈGLES STRICTES :
- "shortname" : max 10 caractères, MAJUSCULES, sans espaces
- Nodes "page" et "quiz" : description courte (1 phrase) — le contenu sera généré séparément
- Nodes "assign" et "forum" : description complète (3-5 phrases) — elle sera utilisée directement
- "questionCount" : entre 3 et 5 pour les quiz
- Pas de champ "content" ni "questions" dans cette étape
- "contentContext" : résumé fidèle du contenu PDF de ce module (si fichiers fournis) ou contenu synthétisé
- Respecte EXACTEMENT ${params.moduleCount} sections
- Activités disponibles : quiz, assign, forum | Ressources : page, url
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

  try {
    const parsed = JSON.parse(extractJsonArray(raw)) as unknown[];
    return injectQuizIds(parsed);
  } catch {
    return [];
  }
}

// ─── Step 2: orchestration (collect all nodes needing content) ─────────────────

interface ContentTask {
  sectionIdx: number;
  nodeIdx: number;
  isBranchChild?: 'true' | 'false';
  node: ScenNodeSkeleton;
  context: string;
}

function collectContentTasks(structure: ScenStructure): ContentTask[] {
  const tasks: ContentTask[] = [];

  structure.sections.forEach((section, sIdx) => {
    const context = section.contentContext || section.summary;

    section.nodes.forEach((item, nIdx) => {
      if (item.type === 'branch') {
        const branch = item as ScenBranchSkeleton;
        if (needsContentGeneration(branch.trueNode)) {
          tasks.push({ sectionIdx: sIdx, nodeIdx: nIdx, isBranchChild: 'true', node: branch.trueNode, context });
        }
        if (needsContentGeneration(branch.falseNode)) {
          tasks.push({ sectionIdx: sIdx, nodeIdx: nIdx, isBranchChild: 'false', node: branch.falseNode, context });
        }
      } else {
        const node = item as ScenNodeSkeleton;
        if (needsContentGeneration(node)) {
          tasks.push({ sectionIdx: sIdx, nodeIdx: nIdx, node, context });
        }
      }
    });
  });

  return tasks;
}

function needsContentGeneration(node: ScenNodeSkeleton): boolean {
  return node.subtype === 'page' || node.subtype === 'quiz';
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

function scenarizationToMindmap(result: ScenResult): {
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
      data: { name: section.name, summary: section.summary, visible: true },
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

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scenarizeCourse(
  params: ScenarizationParams,
  res: Response,
): Promise<void> {
  const client = getClient();
  initSSE(res);

  try {
    // ── PHASE 1: generate structure skeleton ──────────────────────────────────

    sendSSE(res, 'progress', { step: 'structure', message: 'Analyse des fichiers et structuration du cours…' });

    const docParts: Array<{
      type: 'document';
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
      title?: string;
    }> = [];
    const textParts: string[] = [];
    let hasPdf = false;

    for (const file of params.files) {
      if (file.type === 'pdf') {
        hasPdf = true;
        docParts.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.content },
          title: file.name,
        });
      } else {
        textParts.push(`## ${file.name}\n\n${file.content.slice(0, MAX_TEXT_FILE_CHARS)}`);
      }
    }

    const structureSystemPrompt = buildStructurePrompt(params);
    const userText = [
      params.files.length > 0
        ? 'Analyse les fichiers ci-dessous et génère la structure du cours :'
        : 'Génère la structure du cours basée sur les paramètres.',
      textParts.join('\n\n---\n\n'),
      '\nRetourne le JSON de structure maintenant.',
    ].filter(Boolean).join('\n\n');

    const userContent: unknown[] = [
      ...docParts,
      { type: 'text', text: userText },
    ];

    let structureText = '';

    if (hasPdf) {
      sendSSE(res, 'progress', { step: 'structure', message: 'Lecture des PDFs en cours (20-40 s)…' });

      const message = await (client.beta.messages.create as unknown as (
        p: Record<string, unknown>,
      ) => Promise<{ stop_reason: string; content: Array<{ type: string; text?: string }> }>)({
        model: MODEL_STRUCTURE,
        max_tokens: MAX_TOKENS_STRUCTURE,
        system: structureSystemPrompt,
        messages: [{ role: 'user', content: userContent }],
        betas: ['pdfs-2024-09-25'],
      });

      if (message.stop_reason === 'max_tokens') {
        sendSSE(res, 'error', {
          message: 'Réponse tronquée (limite de tokens atteinte). Réduis le nombre de modules ou de fichiers et réessaie.',
        });
        return;
      }

      structureText = message.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
    } else {
      const stream = client.messages.stream({
        model: MODEL_STRUCTURE,
        max_tokens: MAX_TOKENS_STRUCTURE,
        system: structureSystemPrompt,
        messages: [{ role: 'user', content: userContent as Anthropic.ContentBlockParam[] }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          structureText += event.delta.text;
          sendSSE(res, 'delta', { text: event.delta.text });
        }
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

    // ── PHASE 2: generate content per node ───────────────────────────────────

    const tasks = collectContentTasks(structure);
    const totalTasks = tasks.length;

    sendSSE(res, 'progress', {
      step: 'content',
      message: `Génération du contenu (${totalTasks} nœuds en parallèle)…`,
      total: totalTasks,
      done: 0,
    });

    // Deep-clone structure to enrich it
    const enriched: ScenResult = {
      ...structure,
      sections: structure.sections.map((s) => ({
        name: s.name,
        summary: s.summary,
        objectives: s.objectives,
        nodes: s.nodes.map((item) => {
          if (item.type === 'branch') {
            return {
              ...item,
              trueNode: { ...item.trueNode } as ScenNodeEnriched,
              falseNode: { ...item.falseNode } as ScenNodeEnriched,
            } as ScenBranchEnriched;
          }
          return { ...item } as ScenNodeEnriched;
        }),
      })),
    };

    // Helper to find the enriched node for a task
    function getEnrichedNode(task: ContentTask): ScenNodeEnriched {
      const sectionNodes = enriched.sections[task.sectionIdx].nodes;
      const item = sectionNodes[task.nodeIdx];
      if (task.isBranchChild) {
        const branch = item as ScenBranchEnriched;
        return task.isBranchChild === 'true' ? branch.trueNode : branch.falseNode;
      }
      return item as ScenNodeEnriched;
    }

    let doneCount = 0;
    const heartbeat = startHeartbeat(res);

    const contentTaskFns = tasks.map((task) => async () => {
      const node = getEnrichedNode(task);
      const context = structure.sections[task.sectionIdx].contentContext || structure.sections[task.sectionIdx].summary;

      if (node.subtype === 'page') {
        const html = await generatePageHtml(client, node.name, node.description, context, params.language);
        node.content = html;
      } else if (node.subtype === 'quiz') {
        const questions = await generateQuizForScen(
          client, node.name, node.description, context,
          task.node.questionCount ?? 3, params.language,
        );
        node.questions = questions;
      }

      doneCount++;
      sendSSE(res, 'node_done', {
        name: node.name,
        type: node.subtype,
        index: doneCount,
        total: totalTasks,
      });
    });

    await withConcurrency(contentTaskFns, CONCURRENCY);
    clearInterval(heartbeat);

    // ── PHASE 3: convert to mindmap ───────────────────────────────────────────

    sendSSE(res, 'progress', { step: 'converting', message: 'Conversion en mindmap…' });

    const { nodes, edges, meta } = scenarizationToMindmap(enriched);
    sendSSE(res, 'done', { nodes, edges, meta });

  } catch (err) {
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    res.end();
  }
}
