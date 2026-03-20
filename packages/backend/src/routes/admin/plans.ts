import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

const router = Router();

const planSchema = z.object({
  name:                 z.string().min(1).max(100),
  slug:                 z.string().min(1).max(50),
  description:          z.string().optional(),
  price_monthly_cents:  z.number().int().min(0),
  price_yearly_cents:   z.number().int().min(0),
  currency:             z.string().length(3).default('EUR'),
  limits:               z.record(z.number()),
  features:             z.record(z.boolean()),
  is_active:            z.boolean().default(true),
  sort_order:           z.number().int().default(0),
});

// GET /api/v1/admin/plans
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('sort_order');

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

// POST /api/v1/admin/plans
router.post('/', async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data, error } = await supabase
    .from('subscription_plans')
    .insert(parsed.data)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json({ data });
});

// PUT /api/v1/admin/plans/:id
router.put('/:id', async (req, res) => {
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data, error } = await supabase
    .from('subscription_plans')
    .update(parsed.data)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

export default router;
