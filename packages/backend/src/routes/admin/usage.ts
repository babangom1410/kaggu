import { Router } from 'express';
import { supabase } from '../../lib/supabase';

const router = Router();

// GET /api/v1/admin/usage?org=&event_type=&from=&to=&limit=
router.get('/', async (req, res) => {
  const { org, event_type, from, to, limit = '100' } = req.query as Record<string, string>;

  let query = supabase
    .from('usage_logs')
    .select('*, organizations(name, slug), license_keys(key)')
    .order('created_at', { ascending: false })
    .limit(Math.min(parseInt(limit), 1000));

  if (org)         query = query.eq('organization_id', org);
  if (event_type)  query = query.eq('event_type', event_type);
  if (from)        query = query.gte('created_at', from);
  if (to)          query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data });
});

// GET /api/v1/admin/usage/dashboard — pre-computed KPIs
router.get('/dashboard', async (_req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [orgs, activeLicenses, recentUsage, plans] = await Promise.all([
    supabase.from('organizations').select('id, status'),
    supabase.from('license_keys').select('id, status').eq('status', 'active'),
    supabase.from('usage_logs').select('event_type').gte('created_at', thirtyDaysAgo),
    supabase.from('subscription_plans').select('id, slug, name'),
  ]);

  const totalOrgs = orgs.data?.length ?? 0;
  const activeOrgs = orgs.data?.filter((o) => o.status === 'active').length ?? 0;
  const totalActiveLicenses = activeLicenses.data?.length ?? 0;

  const eventCounts = (recentUsage.data ?? []).reduce<Record<string, number>>((acc, log) => {
    acc[log.event_type] = (acc[log.event_type] ?? 0) + 1;
    return acc;
  }, {});

  res.json({
    data: {
      organizations:    { total: totalOrgs, active: activeOrgs },
      licenses:         { active: totalActiveLicenses },
      usage_last_30d:   eventCounts,
      plans:            plans.data ?? [],
    },
  });
});

export default router;
