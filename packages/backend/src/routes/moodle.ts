import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { getSiteInfo, getCategories, checkFunctions, MoodleError } from '../services/moodle.service';
import { exportProject } from '../services/export.service';
import { importFromMoodle } from '../services/import.service';

const router = Router();

// All moodle routes require auth
router.use(authMiddleware);

const connectSchema = z.object({
  url: z.string().url('Invalid Moodle URL'),
  token: z.string().min(1, 'Token is required'),
});

const REQUIRED_NATIVE_FUNCTIONS = [
  'core_webservice_get_site_info',
  'core_course_create_courses',
  'core_course_update_courses',
  'core_course_get_contents',
  'core_course_get_categories',
];

const PLUGIN_FUNCTIONS = [
  'local_kaggu_ensure_section',
  'local_kaggu_create_module',
  'local_kaggu_update_module',
];

// POST /api/v1/moodle/connect — Validate Moodle connection
router.post('/connect', async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { url, token } = parsed.data;
  try {
    const siteInfo = await getSiteInfo({ url, token });

    // Parse Moodle version (e.g., "2024042200" → "4.4")
    const versionNum = parseInt(siteInfo.moodleversion, 10);
    const major = Math.floor(versionNum / 1_000_000);
    const minor = Math.floor((versionNum % 1_000_000) / 10_000);

    if (versionNum < 2020_0000_00) {
      return res.status(400).json({ error: 'Moodle version 3.9 or higher is required' });
    }

    const missingNative = checkFunctions(siteInfo, REQUIRED_NATIVE_FUNCTIONS);
    const missingPlugin = checkFunctions(siteInfo, PLUGIN_FUNCTIONS);

    return res.json({
      data: {
        sitename: siteInfo.sitename,
        username: siteInfo.username,
        moodleVersion: `${major}.${minor}`,
        release: siteInfo.release,
        hasPlugin: missingPlugin.length === 0,
        missingFunctions: [...missingNative, ...missingPlugin],
      },
    });
  } catch (err) {
    if (err instanceof MoodleError) {
      return res.status(400).json({ error: err.message, errorcode: err.errorcode });
    }
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/moodle/categories — List Moodle categories
router.post('/categories', async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  try {
    const categories = await getCategories(parsed.data);
    return res.json({ data: categories });
  } catch (err) {
    if (err instanceof MoodleError) {
      return res.status(400).json({ error: err.message, errorcode: err.errorcode });
    }
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/moodle/projects/:id/export — Export mindmap to Moodle
router.post('/projects/:id/export', async (req, res) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const report = await exportProject(userId, projectId);
    return res.json({ data: report });
  } catch (err) {
    if (err instanceof MoodleError) {
      return res.status(400).json({ error: err.message, errorcode: err.errorcode });
    }
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/moodle/projects/:id/import — Import Moodle course into project
router.post('/projects/:id/import', async (req, res) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const schema = z.object({
    moodleCourseId: z.number().int().positive('Invalid Moodle course ID'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  try {
    const result = await importFromMoodle(userId, projectId, parsed.data.moodleCourseId);
    return res.json({ data: result });
  } catch (err) {
    if (err instanceof MoodleError) {
      return res.status(400).json({ error: err.message, errorcode: err.errorcode });
    }
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
