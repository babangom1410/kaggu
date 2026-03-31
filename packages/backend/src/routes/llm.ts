import express, { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  generateNodeContent,
  generateCourseStructure,
  analyzeMindmap,
  generateHtmlContent,
  generateQuizQuestions,
  generateFeedbackItems,
  generateLessonPages,
  generateBookChapters,
} from '../services/llm.service';
import { scenarizeCourse, scenarizeCourseStructure, scenarizeContent } from '../services/scenarize.service';

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

// POST /api/v1/llm/generate-lesson — generate lesson pages (JSON)
router.post('/generate-lesson', async (req, res) => {
  const schema = z.object({
    lessonName: z.string().min(1),
    prompt:     z.string().min(1).max(2000),
    pageCount:  z.number().int().min(1).max(30).default(5),
    pageTypes:  z.array(z.enum(['content', 'multichoice', 'truefalse', 'shortanswer'])).min(1).default(['content', 'multichoice']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await generateLessonPages(parsed.data);
    res.json({ data: result.pages, input_tokens: result.input_tokens, output_tokens: result.output_tokens });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/llm/generate-book — generate book chapters (JSON)
router.post('/generate-book', async (req, res) => {
  const schema = z.object({
    bookName:     z.string().min(1),
    prompt:       z.string().min(1).max(2000),
    chapterCount: z.number().int().min(1).max(20).default(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await generateBookChapters(parsed.data);
    res.json({ data: result.chapters, input_tokens: result.input_tokens, output_tokens: result.output_tokens });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/llm/generate-feedback — generate feedback items (JSON)
router.post('/generate-feedback', async (req, res) => {
  const schema = z.object({
    feedbackName: z.string().min(1),
    prompt:       z.string().min(1).max(2000),
    itemCount:    z.number().int().min(1).max(20).default(5),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await generateFeedbackItems(parsed.data);
    res.json({ data: result.items, input_tokens: result.input_tokens, output_tokens: result.output_tokens });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/llm/scenarize — generate full course mindmap from files + params (SSE)
router.post(
  '/scenarize',
  express.json({ limit: '20mb' }),
  async (req, res) => {
    const MAX_PDF_BASE64_CHARS = 8 * 1024 * 1024; // ~6 MB PDF → 8 MB base64
    const fileSchema = z.object({
      name:    z.string().min(1),
      type:    z.enum(['pdf', 'markdown', 'text']),
      content: z.string().min(1).max(MAX_PDF_BASE64_CHARS, 'Fichier trop volumineux (max ~6 MB par PDF)'),
    });

    const schema = z.object({
      files:             z.array(fileSchema).max(10).default([]),
      level:             z.string().min(1).max(100),
      duration:          z.string().min(1).max(100),
      moduleCount:       z.number().int().min(1).max(20).default(4),
      language:          z.string().min(2).max(50).default('Français'),
      additionalContext: z.string().max(1000).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    await scenarizeCourse(parsed.data, res);
  },
);

// POST /api/v1/llm/scenarize/structure — Phase 1 only: PDF → structure skeleton → mindmap (SSE)
router.post(
  '/scenarize/structure',
  express.json({ limit: '20mb' }),
  async (req, res) => {
    const MAX_PDF_BASE64_CHARS = 8 * 1024 * 1024;
    const fileSchema = z.object({
      name:    z.string().min(1),
      type:    z.enum(['pdf', 'markdown', 'text']),
      content: z.string().min(1).max(MAX_PDF_BASE64_CHARS, 'Fichier trop volumineux (max ~6 MB par PDF)'),
    });

    const schema = z.object({
      files:             z.array(fileSchema).max(10).default([]),
      level:             z.string().min(1).max(100),
      duration:          z.string().min(1).max(100),
      moduleCount:       z.number().int().min(1).max(20).default(4),
      language:          z.string().min(2).max(50).default('Français'),
      additionalContext: z.string().max(1000).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    await scenarizeCourseStructure(parsed.data, res);
  },
);

// POST /api/v1/llm/scenarize/content — Phase 2: generate HTML + quiz questions for nodes (SSE)
router.post(
  '/scenarize/content',
  express.json({ limit: '1mb' }),
  async (req, res) => {
    const taskSchema = z.object({
      nodeId:       z.string().min(1),
      subtype:      z.enum(['page', 'quiz']),
      name:         z.string().min(1),
      description:  z.string().default(''),
      contentContext: z.string().default(''),
      questionCount: z.number().int().min(1).max(10).optional(),
    });

    const schema = z.object({
      tasks:    z.array(taskSchema).min(1).max(100),
      language: z.string().min(2).max(50).default('Français'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    await scenarizeContent(parsed.data, res);
  },
);

export default router;
