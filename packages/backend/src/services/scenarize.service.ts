import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import { initSSE, sendSSE } from './llm.service';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;

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

// ─── Internal schema types ────────────────────────────────────────────────────

interface ScenQuizAnswer {
  text: string;
  correct: boolean;
  feedback?: string;
}

interface ScenQuizQuestion {
  type: 'multichoice' | 'truefalse' | 'shortanswer' | 'numerical';
  text: string;
  points: number;
  single?: boolean;
  answers?: ScenQuizAnswer[];
  correct?: boolean;
  feedbackTrue?: string;
  feedbackFalse?: string;
  answer?: number;
  tolerance?: number;
  generalfeedback?: string;
}

interface ScenNode {
  type: 'resource' | 'activity';
  subtype: string;
  name: string;
  description?: string;
  content?: string;
  url?: string;
  maxgrade?: number;
  submissiontype?: 'online_text' | 'file' | 'both';
  completion?: number;
  questions?: ScenQuizQuestion[];
}

interface ScenBranch {
  type: 'branch';
  conditionType: 'completion' | 'grade';
  gradeMin?: number;
  referenceNodeName: string;
  trueNode: ScenNode;
  falseNode: ScenNode;
}

type ScenItem = ScenNode | ScenBranch;

interface ScenSection {
  name: string;
  summary: string;
  objectives: string[];
  nodes: ScenItem[];
}

interface ScenResult {
  courseName: string;
  shortname: string;
  summary: string;
  outcomes: string[];
  competencies: string[];
  sections: ScenSection[];
}

// ─── Mindmap shape (mirrors frontend ReactFlow Node/Edge) ─────────────────────

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

// ─── ID helpers ───────────────────────────────────────────────────────────────

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

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJsonBlock(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end > start ? text.slice(start, end + 1) : text.trim();
}

// ─── Quiz ID injection ────────────────────────────────────────────────────────

function injectQuizIds(questions: ScenQuizQuestion[]): unknown[] {
  return questions.map((q) => ({
    ...q,
    id: generateUUID(),
    answers: Array.isArray(q.answers)
      ? q.answers.map((a) => ({ ...a, id: generateUUID() }))
      : undefined,
  }));
}

// ─── Node builder ─────────────────────────────────────────────────────────────

function buildNodeData(item: ScenNode): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: item.name,
    subtype: item.subtype,
    description: item.description ?? '',
    visible: true,
    completion:
      item.completion ?? (item.subtype === 'quiz' || item.subtype === 'assign' ? 2 : 1),
  };

  if (item.subtype === 'page') {
    base.content = item.content ?? '';
  } else if (item.subtype === 'url') {
    base.url = item.url ?? '';
  } else if (item.subtype === 'quiz' && Array.isArray(item.questions)) {
    base.questions = injectQuizIds(item.questions);
  } else if (item.subtype === 'assign') {
    base.maxgrade = item.maxgrade ?? 20;
    base.submissiontype = item.submissiontype ?? 'online_text';
  }

  return base;
}

function createNode(
  item: ScenNode,
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

// ─── Scenarization → Mindmap conversion ──────────────────────────────────────

function scenarizationToMindmap(result: ScenResult): {
  nodes: MindmapNodeShape[];
  edges: MindmapEdgeShape[];
  meta: { outcomes: string[]; competencies: string[]; courseName: string; summary: string };
} {
  const nodes: MindmapNodeShape[] = [];
  const edges: MindmapEdgeShape[] = [];

  // Course root
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
    const sy = 320;

    nodes.push({
      id: sectionId,
      type: 'section',
      position: { x: sx, y: sy },
      data: { name: section.name, summary: section.summary, visible: true },
    });
    edges.push({ id: newEdgeId(courseId, sectionId), source: courseId, target: sectionId });

    let currentY = 560;
    const nameIndex = new Map<string, string>();

    for (const item of section.nodes) {
      if (item.type === 'branch') {
        const refId = nameIndex.get(item.referenceNodeName);
        if (!refId) {
          // Fallback: attach branch to section if reference not found
          const branchId = newId('scen-branch');
          nodes.push({
            id: branchId,
            type: 'branch',
            position: { x: sx, y: currentY },
            data: {
              conditionType: item.conditionType,
              gradeMin: item.gradeMin,
              referenceNodeId: '',
            },
          });
          edges.push({ id: newEdgeId(sectionId, branchId), source: sectionId, target: branchId });

          const trueId = createNode(item.trueNode, nodes, sx + 260, currentY, nameIndex);
          edges.push({ id: newEdgeId(branchId, trueId, '-t'), source: branchId, target: trueId, sourceHandle: 'source-true' });

          const falseId = createNode(item.falseNode, nodes, sx, currentY + 180, nameIndex);
          edges.push({ id: newEdgeId(branchId, falseId, '-f'), source: branchId, target: falseId, sourceHandle: 'source-false' });

          currentY += 380;
          continue;
        }

        const branchId = newId('scen-branch');
        nodes.push({
          id: branchId,
          type: 'branch',
          position: { x: sx, y: currentY },
          data: {
            conditionType: item.conditionType,
            gradeMin: item.gradeMin,
            referenceNodeId: refId,
          },
        });
        edges.push({ id: newEdgeId(refId, branchId), source: refId, target: branchId });

        const trueId = createNode(item.trueNode, nodes, sx + 260, currentY, nameIndex);
        edges.push({ id: newEdgeId(branchId, trueId, '-t'), source: branchId, target: trueId, sourceHandle: 'source-true' });

        const falseId = createNode(item.falseNode, nodes, sx, currentY + 180, nameIndex);
        edges.push({ id: newEdgeId(branchId, falseId, '-f'), source: branchId, target: falseId, sourceHandle: 'source-false' });

        currentY += 380;
      } else {
        const nodeId = createNode(item as ScenNode, nodes, sx, currentY, nameIndex);
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

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(params: ScenarizationParams): string {
  return `Tu es un ingénieur pédagogique expert qui scénarise des formations Moodle.
Tu analyses les fichiers fournis (contenu du cours) et génères une structure complète de cours.

PARAMÈTRES DE CONCEPTION :
- Niveau : ${params.level}
- Durée totale : ${params.duration}
- Nombre de modules souhaité : ${params.moduleCount}
- Langue de sortie : ${params.language}
${params.additionalContext ? `- Contexte additionnel : ${params.additionalContext}` : ''}

Retourne UNIQUEMENT un JSON valide (sans texte avant ni après, sans blocs markdown) avec cette structure :

{
  "courseName": "Titre complet du cours",
  "shortname": "CODE10",
  "summary": "<p>Description HTML du cours (2-3 phrases)</p>",
  "outcomes": ["Résultat attendu 1", "Résultat attendu 2", "Résultat attendu 3"],
  "competencies": ["Compétence 1", "Compétence 2", "Compétence 3"],
  "sections": [
    {
      "name": "Module 1 : Titre",
      "summary": "Résumé de ce module",
      "objectives": ["Objectif 1", "Objectif 2"],
      "nodes": [
        {
          "type": "resource",
          "subtype": "page",
          "name": "Introduction : Titre",
          "description": "Brève description",
          "content": "<h2>Titre</h2><p>Contenu HTML pédagogique.</p><ul><li>Point clé 1</li></ul>",
          "completion": 1
        },
        {
          "type": "activity",
          "subtype": "quiz",
          "name": "Quiz : Titre",
          "description": "Vérifier la compréhension",
          "completion": 2,
          "questions": [
            {
              "type": "multichoice",
              "text": "Question à choix multiples ?",
              "points": 1,
              "single": true,
              "answers": [
                { "text": "Réponse correcte", "correct": true, "feedback": "Excellent !" },
                { "text": "Réponse incorrecte A", "correct": false, "feedback": "Non." },
                { "text": "Réponse incorrecte B", "correct": false, "feedback": "Non." }
              ],
              "generalfeedback": "La bonne réponse est..."
            },
            {
              "type": "truefalse",
              "text": "Affirmation à évaluer.",
              "points": 1,
              "correct": true,
              "feedbackTrue": "Correct !",
              "feedbackFalse": "Non, c'est vrai.",
              "generalfeedback": "..."
            },
            {
              "type": "shortanswer",
              "text": "Donnez la définition de X.",
              "points": 2,
              "answers": [{ "text": "réponse attendue", "correct": true, "feedback": "Exact !" }],
              "generalfeedback": "X est défini comme..."
            }
          ]
        },
        {
          "type": "activity",
          "subtype": "assign",
          "name": "Devoir : Titre",
          "description": "<p>Énoncé du devoir en HTML.</p>",
          "maxgrade": 20,
          "submissiontype": "online_text",
          "completion": 2
        }
      ]
    }
  ]
}

RÈGLES IMPORTANTES :
- "shortname" : exactement 10 caractères max, majuscules, sans espaces (ex: "PYTHON101", "HIST2025")
- "content" des pages : HTML simple uniquement (h2, h3, p, ul, ol, li, strong, em, hr) — JAMAIS html/head/body/script
- Quiz : 3 à 5 questions par quiz, types variés (multichoice, truefalse, shortanswer, numerical si pertinent)
- "completion" : 1=vu, 2=noté (quiz/devoir=2, page/url=1)
- Activités disponibles : quiz, assign, forum, lesson
- Ressources disponibles : page, url, book
- Pour les "url" : { "type": "resource", "subtype": "url", "name": "...", "url": "https://...", "description": "...", "completion": 1 }
- BranchNode (parcours conditionnel) : à utiliser UNIQUEMENT si la différenciation est pédagogiquement justifiée et importante.
  Format :
  {
    "type": "branch",
    "conditionType": "grade",
    "gradeMin": 60,
    "referenceNodeName": "Quiz : Nom exact du quiz précédent",
    "trueNode": { "type": "activity", "subtype": "assign", "name": "...", "description": "...", "maxgrade": 20, "submissiontype": "online_text", "completion": 2 },
    "falseNode": { "type": "resource", "subtype": "page", "name": "Révisions : ...", "content": "<p>...</p>", "completion": 1 }
  }
- Si aucun contenu de fichier n'est fourni, génère un cours cohérent basé sur le titre/sujet déduit des paramètres
- Respecte STRICTEMENT le nombre de modules demandé : ${params.moduleCount} sections`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scenarizeCourse(
  params: ScenarizationParams,
  res: Response,
): Promise<void> {
  const client = getClient();

  initSSE(res);
  sendSSE(res, 'progress', { step: 'analyzing', message: 'Analyse des fichiers en cours…' });

  try {
    // Build message content
    const textParts: string[] = [];
    const docParts: Array<{
      type: 'document';
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
      title?: string;
    }> = [];

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
        textParts.push(`## Fichier : ${file.name}\n\n${file.content}`);
      }
    }

    sendSSE(res, 'progress', { step: 'generating', message: 'Scénarisation du cours en cours…' });

    const systemPrompt = buildSystemPrompt(params);
    const userText = [
      params.files.length > 0
        ? 'Voici le contenu des fichiers fournis. Analyse-les pour structurer le cours :'
        : 'Génère un cours complet basé sur les paramètres pédagogiques fournis.',
      textParts.join('\n\n---\n\n'),
      '\nGénère maintenant le JSON de scénarisation complet.',
    ]
      .filter(Boolean)
      .join('\n\n');

    // Build content array for the message
    const userContent: unknown[] = [
      ...docParts,
      { type: 'text', text: userText },
    ];

    let fullText = '';

    if (hasPdf) {
      // Use beta API for PDF documents (non-streaming to avoid type issues)
      sendSSE(res, 'progress', { step: 'generating', message: 'Traitement des PDFs et génération (30-60 s)…' });

      const message = await (client.beta.messages.create as unknown as (
        params: Record<string, unknown>,
      ) => Promise<{ content: Array<{ type: string; text?: string }> }>)({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        betas: ['pdfs-2024-09-25'],
      });

      fullText = message.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
    } else {
      // Use streaming for text-only inputs
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent as Anthropic.ContentBlockParam[] }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          sendSSE(res, 'delta', { text: event.delta.text });
        }
      }
    }

    sendSSE(res, 'progress', { step: 'converting', message: 'Conversion en mindmap…' });

    // Parse JSON
    const jsonText = extractJsonBlock(fullText);
    let scenResult: ScenResult;
    try {
      scenResult = JSON.parse(jsonText) as ScenResult;
    } catch {
      sendSSE(res, 'error', { message: `Impossible d'analyser le JSON généré. Réessaie.` });
      return;
    }

    // Convert to mindmap nodes/edges
    const { nodes, edges, meta } = scenarizationToMindmap(scenResult);

    sendSSE(res, 'done', { nodes, edges, meta });
  } catch (err) {
    sendSSE(res, 'error', { message: (err as Error).message });
  } finally {
    res.end();
  }
}
