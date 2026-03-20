import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { createLicenseKey, type LicenseTier } from '../../services/license.service';

const router = Router();

const createSchema = z.object({
  organization_id: z.string().uuid(),
  subscription_id: z.string().uuid(),
  tier:            z.enum(['TRI', 'STR', 'PRO', 'ENT']),
  expires_at:      z.string().datetime().optional(),
});

// GET /api/v1/admin/licenses
router.get('/', async (req, res) => {
  const { org } = req.query;
  let query = supabase
    .from('license_keys')
    .select('*, organizations(name, slug)')
    .order('created_at', { ascending: false });

  if (org) query = query.eq('organization_id', org);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

// POST /api/v1/admin/licenses — generate a new key
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const license = await createLicenseKey(
      parsed.data.organization_id,
      parsed.data.subscription_id,
      parsed.data.tier as LicenseTier,
      parsed.data.expires_at,
    );
    res.status(201).json({ data: license });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/v1/admin/licenses/:id — suspend or revoke
router.put('/:id', async (req, res) => {
  const { status } = req.body as { status?: string };
  const allowed = ['active', 'suspended', 'revoked'];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    return;
  }

  const { data, error } = await supabase
    .from('license_keys')
    .update({ status, ...(status === 'active' ? {} : {}) })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

// POST /api/v1/admin/licenses/:id/regenerate
router.post('/:id/regenerate', async (req, res) => {
  // Get existing license to determine tier from key prefix
  const { data: existing, error: fetchErr } = await supabase
    .from('license_keys')
    .select('organization_id, subscription_id, key, expires_at')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !existing) { res.status(404).json({ error: 'License not found' }); return; }

  const tierMatch = existing.key.match(/^KGU-([A-Z]+)-/);
  const tier = (tierMatch?.[1] ?? 'PRO') as LicenseTier;

  // Revoke old key
  await supabase.from('license_keys').update({ status: 'revoked' }).eq('id', req.params.id);

  try {
    const newLicense = await createLicenseKey(
      existing.organization_id,
      existing.subscription_id,
      tier,
      existing.expires_at ?? undefined,
    );
    res.status(201).json({ data: newLicense });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/admin/licenses/:id/binding — reset moodle_url binding
router.delete('/:id/binding', async (req, res) => {
  const { data, error } = await supabase
    .from('license_keys')
    .update({ moodle_url: null, moodle_site_id: null, activated_at: null })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

export default router;
