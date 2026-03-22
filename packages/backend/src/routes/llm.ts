import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  generateNodeContent,
  generateCourseStructure,
  analyzeMindmap,
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

export default router;
