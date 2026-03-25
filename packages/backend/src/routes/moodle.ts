import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { getSiteInfo, getCategories, checkFunctions, getCourse, getCourseContents, MoodleError } from '../services/moodle.service';
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

// DELETE /api/v1/moodle/projects/:id/reset — Clear all Moodle mappings for a fresh export
router.delete('/projects/:id/reset', async (req, res) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  // Verify project ownership
  const { data: project, error: projErr } = await (await import('../lib/supabase')).supabase
    .from('projects')
    .select('id, moodle_config')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projErr || !project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { supabase } = await import('../lib/supabase');

  // Delete all mappings for this project
  await supabase.from('moodle_mappings').delete().eq('project_id', projectId);

  // Clear courseId from moodle_config
  const config = (project.moodle_config as Record<string, unknown>) ?? {};
  delete config.courseId;
  await supabase
    .from('projects')
    .update({ moodle_config: config, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return res.json({ data: { ok: true } });
});

// POST /api/v1/moodle/projects/:id/preview — Preview Moodle course structure without saving
router.post('/projects/:id/preview', async (req, res) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const schema = z.object({
    moodleCourseId: z.number().int().positive('Invalid Moodle course ID'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  // Verify project ownership and get moodle config
  const { data: project, error: projErr } = await (await import('../lib/supabase')).supabase
    .from('projects')
    .select('moodle_config, nodes')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projErr || !project) {
    return res.status(404).json({ error: 'Project not found or access denied' });
  }

  const moodleConfig = project.moodle_config as { url: string; token: string } | null;
  if (!moodleConfig?.url || !moodleConfig?.token) {
    return res.status(400).json({ error: 'Moodle connection not configured' });
  }

  try {
    const config = { url: moodleConfig.url, token: moodleConfig.token };
    const [courseResult, sectionsResult] = await Promise.allSettled([
      getCourse(config, parsed.data.moodleCourseId),
      getCourseContents(config, parsed.data.moodleCourseId),
    ]);

    if (courseResult.status === 'rejected') {
      const err = courseResult.reason as Error;
      return res.status(400).json({ error: err.message });
    }

    const courseInfo = courseResult.value[0];
    if (!courseInfo) return res.status(404).json({ error: `Course ${parsed.data.moodleCourseId} not found` });

    const existingNodes = Array.isArray(project.nodes) ? project.nodes : [];
    const hasContent = existingNodes.length > 1;

    // If sections failed (e.g. broken module record in Moodle), still return course info
    const sections = sectionsResult.status === 'fulfilled' ? sectionsResult.value : [];
    const sectionsWarning = sectionsResult.status === 'rejected'
      ? `Impossible de charger les sections : ${(sectionsResult.reason as Error).message}`
      : null;

    const preview = {
      courseId: parsed.data.moodleCourseId,
      courseName: courseInfo.fullname,
      shortname: courseInfo.shortname,
      hasContent,
      sectionsWarning,
      sections: sections
        .filter((s) => s.section !== 0)
        .map((s) => ({
          name: String(s.name || `Section ${s.section}`),
          modulesCount: s.modules.length,
          modules: s.modules.map((m) => ({
            name: String(m.name),
            modname: String(m.modname),
          })),
        })),
    };

    return res.json({ data: preview });
  } catch (err) {
    if (err instanceof MoodleError) {
      return res.status(400).json({ error: err.message });
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
