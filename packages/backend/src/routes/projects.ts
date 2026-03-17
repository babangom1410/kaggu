import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

const projectBodySchema = z.object({
  name: z.string().min(1).max(200),
  nodes: z.array(z.any()).default([]),
  edges: z.array(z.any()).default([]),
  moodle_config: z.record(z.any()).nullable().optional(),
});

// GET /api/v1/projects — list user projects
router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, created_at, updated_at')
    .eq('user_id', req.user!.id)
    .order('updated_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ data });
});

// GET /api/v1/projects/:id — get single project (full data)
router.get('/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .single();

  if (error) {
    res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    return;
  }
  res.json({ data });
});

// POST /api/v1/projects — create project
router.post('/', authMiddleware, async (req, res) => {
  const parsed = projectBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({ ...parsed.data, user_id: req.user!.id })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json({ data });
});

// PUT /api/v1/projects/:id — update project
router.put('/:id', authMiddleware, async (req, res) => {
  const parsed = projectBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabase
    .from('projects')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .select()
    .single();

  if (error) {
    res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    return;
  }
  res.json({ data });
});

// DELETE /api/v1/projects/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(204).send();
});

export default router;
