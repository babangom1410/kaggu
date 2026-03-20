import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

const router = Router();

const orgSchema = z.object({
  name:          z.string().min(1).max(255),
  slug:          z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  contact_email: z.string().email(),
  contact_name:  z.string().min(1).max(255),
  country:       z.string().length(2).optional(),
  metadata:      z.record(z.unknown()).optional(),
  status:        z.enum(['active', 'suspended', 'deleted']).optional(),
});

// GET /api/v1/admin/organizations
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

// POST /api/v1/admin/organizations
router.post('/', async (req, res) => {
  const parsed = orgSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data, error } = await supabase
    .from('organizations')
    .insert(parsed.data)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json({ data });
});

// GET /api/v1/admin/organizations/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('organizations')
    .select('*, subscriptions(*, subscription_plans(*)), license_keys(*)')
    .eq('id', req.params.id)
    .single();

  if (error) { res.status(404).json({ error: 'Organization not found' }); return; }
  res.json({ data });
});

// PUT /api/v1/admin/organizations/:id
router.put('/:id', async (req, res) => {
  const parsed = orgSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data, error } = await supabase
    .from('organizations')
    .update(parsed.data)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

// DELETE /api/v1/admin/organizations/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('organizations')
    .update({ status: 'deleted' })
    .eq('id', req.params.id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: { success: true } });
});

export default router;
