import { supabase } from '../lib/supabase';
import {
  MoodleConnectionConfig,
  getCourseContents,
  resolveCourse,
  computeChecksum,
  moodleModToNodeType,
  getPageContent,
  getBookChapters,
  getQuizQuestions,
} from './moodle.service';

interface ImportedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface ImportedEdge {
  id: string;
  source: string;
  target: string;
}

const COURSE_X = 400;
const COURSE_Y = 80;
const SECTION_Y = 280;
const MODULE_Y = 480;
const SECTION_SPACING = 260;
const MODULE_SPACING = 220;

export async function importFromMoodle(
  userId: string,
  projectId: string,
  courseRef: string,
): Promise<{ nodes: ImportedNode[]; edges: ImportedEdge[] }> {
  // 1. Load project and get Moodle config
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('moodle_config')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projErr || !project) throw new Error('Project not found or access denied');

  const moodleConfig = project.moodle_config as { url: string; token: string } | null;
  if (!moodleConfig?.url || !moodleConfig?.token) {
    throw new Error('Moodle connection not configured for this project');
  }

  const config: MoodleConnectionConfig = { url: moodleConfig.url, token: moodleConfig.token };

  // 2. Resolve course reference (ID or shortname) and fetch contents
  const courseInfo = await resolveCourse(config, courseRef);
  if (!courseInfo) throw new Error(`Cours "${courseRef}" introuvable dans Moodle.`);

  const sections = await getCourseContents(config, courseInfo.id).catch(() => []);

  const nodes: ImportedNode[] = [];
  const edges: ImportedEdge[] = [];

  // Track modules needing content enrichment after structure is built
  const pageModules:  Array<{ nodeId: string; cmid: number }> = [];
  const bookModules:  Array<{ nodeId: string; cmid: number }> = [];
  const quizModules:  Array<{ nodeId: string; cmid: number }> = [];

  // 3. Create the course node
  const courseNodeId = `course-root`;
  nodes.push({
    id: courseNodeId,
    type: 'course',
    position: { x: COURSE_X, y: COURSE_Y },
    data: {
      fullname: courseInfo.fullname,
      shortname: courseInfo.shortname,
      summary: courseInfo.summary,
      format: courseInfo.format || 'topics',
      startdate: courseInfo.startdate ? new Date(courseInfo.startdate * 1000).toISOString().split('T')[0] : undefined,
      enddate: courseInfo.enddate ? new Date(courseInfo.enddate * 1000).toISOString().split('T')[0] : undefined,
      visible: courseInfo.visible === 1,
      category: courseInfo.categoryid,
    },
  });

  // 4. Process sections (skip section 0 = General if empty)
  const contentSections = sections.filter(
    (s) => s.section > 0 || s.modules.length > 0,
  );

  const totalSections = contentSections.length;
  const totalWidth = (totalSections - 1) * SECTION_SPACING;
  const sectionStartX = COURSE_X - totalWidth / 2;

  const mappingsToUpsert: Array<{
    project_id: string;
    node_id: string;
    moodle_type: 'course' | 'section' | 'module';
    moodle_id: number;
    last_synced: string;
    checksum: string | null;
  }> = [];

  mappingsToUpsert.push({
    project_id: projectId,
    node_id: courseNodeId,
    moodle_type: 'course',
    moodle_id: courseInfo.id,
    last_synced: new Date().toISOString(),
    checksum: null,
  });

  for (let si = 0; si < contentSections.length; si++) {
    const section = contentSections[si];
    const sectionNodeId = `section-${section.section}-${Date.now()}-${si}`;
    const sectionX = sectionStartX + si * SECTION_SPACING;

    nodes.push({
      id: sectionNodeId,
      type: 'section',
      position: { x: sectionX, y: SECTION_Y },
      data: {
        name: section.name || `Section ${section.section}`,
        summary: section.summary,
        visible: section.visible !== 0,
        position: section.section,
      },
    });

    edges.push({
      id: `edge-${courseNodeId}-${sectionNodeId}`,
      source: courseNodeId,
      target: sectionNodeId,
    });

    mappingsToUpsert.push({
      project_id: projectId,
      node_id: sectionNodeId,
      moodle_type: 'section',
      moodle_id: section.section,
      last_synced: new Date().toISOString(),
      checksum: null,
    });

    // 5. Process modules in this section
    const totalMods = section.modules.length;
    const modTotalWidth = (totalMods - 1) * MODULE_SPACING;
    const modStartX = sectionX - modTotalWidth / 2;

    for (let mi = 0; mi < section.modules.length; mi++) {
      const mod = section.modules[mi];
      const { type, subtype } = moodleModToNodeType(mod.modname);
      const moduleNodeId = `module-${mod.id}-${Date.now()}-${mi}`;
      const moduleX = modStartX + mi * MODULE_SPACING;

      let data: Record<string, unknown> = {
        name: mod.name,
        visible: mod.visible !== 0,
      };

      if (type === 'activity') {
        data = { ...data, subtype, description: mod.intro ?? '' };
        if (subtype === 'assign') {
          data = { ...data, maxgrade: 100, submissiontype: 'online_text' };
        } else if (subtype === 'quiz') {
          data = { ...data, attempts: 0, grademethod: 'highest' };
        } else if (subtype === 'forum') {
          data = { ...data, type: 'general', maxattachments: 9 };
        } else if (subtype === 'h5p') {
          data = { ...data, enabletracking: true, grademethod: 1 };
        } else if (subtype === 'glossary') {
          data = { ...data, displayformat: 'dictionary', allowcomments: false };
        } else if (subtype === 'scorm') {
          data = { ...data, maxattempt: 0, grademethod: 1, whatgrade: 0, maxgrade: 100 };
        } else if (subtype === 'lesson') {
          data = { ...data, maxattempts: 0, retake: false, review: false };
        } else if (subtype === 'choice') {
          data = { ...data, allowupdate: true, showresults: 1 };
        }
      } else {
        data = { ...data, subtype };
        if (subtype === 'url') {
          data = { ...data, url: mod.url ?? '' };
        } else if (subtype === 'page') {
          data = { ...data, content: '' };
          pageModules.push({ nodeId: moduleNodeId, cmid: mod.id });
        } else if (subtype === 'book') {
          data = { ...data, numbering: 1, chapters: [] };
          bookModules.push({ nodeId: moduleNodeId, cmid: mod.id });
        }
      }

      if (type === 'activity' && subtype === 'quiz') {
        quizModules.push({ nodeId: moduleNodeId, cmid: mod.id });
      }

      nodes.push({
        id: moduleNodeId,
        type,
        position: { x: moduleX, y: MODULE_Y },
        data,
      });

      edges.push({
        id: `edge-${sectionNodeId}-${moduleNodeId}`,
        source: sectionNodeId,
        target: moduleNodeId,
      });

      mappingsToUpsert.push({
        project_id: projectId,
        node_id: moduleNodeId,
        moodle_type: 'module',
        moodle_id: mod.id,
        last_synced: new Date().toISOString(),
        checksum: computeChecksum(mod),
      });
    }
  }

  // 6. Enrich nodes with module content (page HTML, book chapters, quiz questions)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Page content — one batch call for the whole course
  if (pageModules.length > 0) {
    try {
      const pages = await getPageContent(config, courseInfo.id);
      const pageByCmid = new Map(pages.map((p) => [p.coursemodule, p]));
      for (const { nodeId, cmid } of pageModules) {
        const page = pageByCmid.get(cmid);
        if (page) {
          const node = nodeMap.get(nodeId);
          if (node) node.data = { ...node.data, content: page.content };
        }
      }
    } catch (err) {
      console.error('[import] getPageContent failed:', (err as Error).message);
    }
  }

  // Book chapters — one call per book
  await Promise.all(
    bookModules.map(async ({ nodeId, cmid }) => {
      try {
        const chapters = await getBookChapters(config, cmid);
        const node = nodeMap.get(nodeId);
        if (node) node.data = { ...node.data, chapters };
      } catch (err) {
        console.error(`[import] getBookChapters cmid=${cmid} failed:`, (err as Error).message);
      }
    }),
  );

  // Quiz questions — one call per quiz
  await Promise.all(
    quizModules.map(async ({ nodeId, cmid }) => {
      try {
        const rawQuestions = await getQuizQuestions(config, cmid);
        // Convert to Kàggu QuizQuestion format
        const questions = rawQuestions.map((q, idx) => {
          const base = {
            id: `imported-${cmid}-${idx}`,
            type: q.type,
            text: q.text,
            points: q.points,
            generalfeedback: q.generalfeedback,
          };
          switch (q.type) {
            case 'multichoice':
              return {
                ...base,
                single: q.single === 1,
                answers: q.answers.map((a, ai) => ({
                  id: `ans-${cmid}-${idx}-${ai}`,
                  text: a.text,
                  correct: a.correct === 1,
                  feedback: a.feedback,
                })),
              };
            case 'truefalse':
              return {
                ...base,
                correct: q.correct === 1,
                feedbackTrue: q.feedbacktrue,
                feedbackFalse: q.feedbackfalse,
              };
            case 'shortanswer':
              return {
                ...base,
                answers: q.answers.map((a, ai) => ({
                  id: `ans-${cmid}-${idx}-${ai}`,
                  text: a.text,
                  feedback: a.feedback,
                })),
              };
            case 'numerical':
              return { ...base, answer: q.answer, tolerance: q.tolerance };
            default:
              return base;
          }
        });
        const node = nodeMap.get(nodeId);
        if (node) node.data = { ...node.data, questions };
      } catch (err) {
        console.error(`[import] getQuizQuestions cmid=${cmid} failed:`, (err as Error).message);
      }
    }),
  );

  // 7. Save mappings and update project
  await Promise.all([
    supabase.from('moodle_mappings').delete().eq('project_id', projectId),
    supabase.from('moodle_mappings').upsert(mappingsToUpsert),
    supabase
      .from('projects')
      .update({
        nodes,
        edges,
        moodle_config: { ...moodleConfig, courseId: courseInfo.id },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId),
  ]);

  return { nodes, edges };
}
