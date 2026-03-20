import { Router } from 'express';
import { z } from 'zod';
import { validateLicense, heartbeatLicense } from '../services/license.service';

const router = Router();

const validateSchema = z.object({
  key:             z.string().min(1),
  moodle_url:      z.string().url(),
  site_id:         z.string().optional(),
  moodle_version:  z.string().optional(),
  plugin_version:  z.string().optional(),
});

// POST /api/v1/licenses/validate — public, called by Moodle plugin
router.post('/validate', async (req, res) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PAYLOAD', message: parsed.error.message });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';

  try {
    const result = await validateLicense(parsed.data, ip);
    const status = result.valid ? 200 : 403;

    if (result.valid) {
      res.status(status).json({ data: result });
    } else {
      res.status(status).json({ error: result.error, message: result.message });
    }
  } catch (err) {
    console.error('[licenses/validate]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Internal server error' });
  }
});

// POST /api/v1/licenses/heartbeat — public, lightweight check
router.post('/heartbeat', async (req, res) => {
  const { key } = req.body as { key?: string };
  if (!key) {
    res.status(400).json({ error: 'MISSING_KEY' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';

  try {
    const result = await heartbeatLicense(key, ip);
    res.status(result.valid ? 200 : 403).json(result.valid ? { data: result } : { error: 'LICENSE_INVALID' });
  } catch (err) {
    console.error('[licenses/heartbeat]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

export default router;
