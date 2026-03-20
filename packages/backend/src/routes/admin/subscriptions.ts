import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

const router = Router();

const subSchema = z.object({
  organization_id:      z.string().uuid(),
  plan_id:              z.string().uuid(),
  status:               z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']),
  current_period_start: z.string().datetime(),
  current_period_end:   z.string().datetime(),
  trial_ends_at:        z.string().datetime().nullable().optional(),
  canceled_at:          z.string().datetime().nullable().optional(),
  payment_provider:     z.string().optional(),
  payment_provider_id:  z.string().optional(),
});

// GET /api/v1/admin/subscriptions
router.get('/', async (req, res) => {
  const { org } = req.query;
  let query = supabase
    .from('subscriptions')
    .select('*, organizations(name, slug), subscription_plans(name, slug)')
    .order('created_at', { ascending: false });

  if (org) query = query.eq('organization_id', org);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

// POST /api/v1/admin/subscriptions
router.post('/', async (req, res) => {
  const parsed = subSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data, error } = await supabase
    .from('subscriptions')
    .insert(parsed.data)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json({ data });
});

// PUT /api/v1/admin/subscriptions/:id
router.put('/:id', async (req, res) => {
  const parsed = subSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data, error } = await supabase
    .from('subscriptions')
    .update(parsed.data)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

export default router;
