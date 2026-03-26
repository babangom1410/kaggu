import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  generateNodeContent,
  generateCourseStructure,
  analyzeMindmap,
  generateHtmlContent,
  generateQuizQuestions,
} from '../services/llm.service';

const router = Router();

// All LLM routes require authentication
router.use(authMiddleware);

// POST /api/v1/llm/generate — generate content for a node (SSE streaming)
router.post('/generate', async (req, res) => {
  const schema = z.object({
    nodeType:      z.enum(['course', 'section', 'resource', 'activity']),
    nodeSubtype:   z.string().optional(),
    nodeName:      z.string().min(1),
    prompt:        z.string().min(1).max(2000),
    courseContext: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await generateNodeContent(parsed.data, res);
});

// POST /api/v1/llm/course-structure — generate full mindmap from description (SSE)
router.post('/course-structure', async (req, res) => {
  const schema = z.object({
    description: z.string().min(10).max(1000),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await generateCourseStructure(parsed.data, res);
});

// POST /api/v1/llm/analyze — analyze mindmap coherence (SSE)
router.post('/analyze', async (req, res) => {
  const schema = z.object({
    mindmapSummary: z.string().min(10).max(3000),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await analyzeMindmap(parsed.data, res);
});

// POST /api/v1/llm/generate-html — generate clean HTML for a Page resource (SSE)
router.post('/generate-html', async (req, res) => {
  const schema = z.object({
    nodeName:        z.string().min(1),
    prompt:          z.string().min(1).max(2000),
    existingContent: z.string().max(10000).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await generateHtmlContent(parsed.data, res);
});

// POST /api/v1/llm/generate-quiz — generate quiz questions from course content (JSON)
router.post('/generate-quiz', async (req, res) => {
  const courseContentSchema = z.object({
    nodeId:  z.string(),
    label:   z.string(),
    content: z.string().max(20000),
  });

  const schema = z.object({
    quizName:      z.string().min(1),
    prompt:        z.string().min(1).max(2000),
    questionCount: z.number().int().min(1).max(50).default(5),
    questionTypes: z.array(
      z.enum(['multichoice', 'truefalse', 'shortanswer', 'numerical'])
    ).min(1).default(['multichoice']),
    courseContent: z.array(courseContentSchema).max(10).default([]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await generateQuizQuestions(parsed.data);
    res.json({ data: result.questions, input_tokens: result.input_tokens, output_tokens: result.output_tokens });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
