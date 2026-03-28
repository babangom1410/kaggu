import { supabase } from '../lib/supabase';
import {
  MoodleError,
  MoodleConnectionConfig,
  createCourse,
  updateCourse,
  ensureSection,
  createModule,
  updateModule,
  updateBookChapters,
  createQuizContent,
  updateLessonPages,
  updateFeedbackItems,
  type QuizQuestionInput,
  type LessonPageData,
  type FeedbackItemData,
  computeChecksum,
  dateToTimestamp,
  uploadFileToDraft,
} from './moodle.service';

interface BackendNode {
  id: string;
  type: 'course' | 'section' | 'resource' | 'activity';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface BackendEdge {
  id: string;
  source: string;
  target: string;
}

interface MoodleMapping {
  project_id: string;
  node_id: string;
  moodle_type: 'course' | 'section' | 'module';
  moodle_id: number;
  checksum: string | null;
}

export interface ExportError {
  nodeId: string;
  nodeName: string;
  error: string;
}

export interface ExportReport {
  courseId: number;
  courseUrl: string;
  courseName: string;
  created: number;
  updated: number;
  skipped: number;
  errors: ExportError[];
}

function getChildren(nodeId: string, edges: BackendEdge[], nodes: BackendNode[]): BackendNode[] {
  const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);
  return childIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as BackendNode[];
}

function sortByPosition(nodes: BackendNode[]): BackendNode[] {
  return [...nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
}

interface Restriction {
  type: 'date' | 'grade' | 'completion';
  direction?: '>=' | '<';
  date?: string;
  nodeId?: string;
  min?: number;
  max?: number;
  expected?: 1 | 0;
}

interface AvailabilityResult {
  json: string | null;
  /** Names of referenced modules that were skipped because they have no completion tracking */
  skippedNoCompletion: string[];
}

function buildAvailabilityJson(
  restrictions: Restriction[],
  mappings: Map<string, { moodle_id: number; moodle_type: string }>,
  nodes: BackendNode[],
  operator?: string,
): AvailabilityResult {
  if (!restrictions || restrictions.length === 0) return { json: null, skippedNoCompletion: [] };

  const conditions: unknown[] = [];
  const showc: boolean[] = [];
  const skippedNoCompletion: string[] = [];

  for (const r of restrictions) {
    if (r.type === 'date') {
      if (!r.date) continue;
      const ts = Math.floor(new Date(r.date).getTime() / 1000);
      if (isNaN(ts)) continue;
      conditions.push({ type: 'date', d: r.direction === '>=' ? '>=' : '<', t: ts });
      showc.push(true);
    } else if (r.type === 'grade') {
      const mapping = r.nodeId ? mappings.get(r.nodeId) : null;
      if (!mapping || mapping.moodle_type !== 'module') continue;
      const cond: Record<string, unknown> = { type: 'grade', id: mapping.moodle_id };
      if (r.min !== undefined) cond.min = r.min / 100;
      if (r.max !== undefined) cond.max = r.max / 100;
      conditions.push(cond);
      showc.push(true);
    } else if (r.type === 'completion') {
      const mapping = r.nodeId ? mappings.get(r.nodeId) : null;
      if (!mapping || mapping.moodle_type !== 'module') continue;
      // Moodle rejects completion conditions that reference a module with
      // completion=0.  Skip the condition and surface a warning instead.
      const refNode = r.nodeId ? nodes.find((n) => n.id === r.nodeId) : null;
      const refCompletion = Number(refNode?.data?.completion ?? 0);
      if (refCompletion === 0) {
        const refName = String(refNode?.data?.name ?? r.nodeId ?? 'unknown');
        skippedNoCompletion.push(refName);
        continue;
      }
      // Moodle 5.x uses 'cm' (not 'id') as the field name for the cmid
      conditions.push({ type: 'completion', cm: mapping.moodle_id, e: r.expected === 1 ? 1 : 0 });
      showc.push(true);
    }
  }

  if (conditions.length === 0) return { json: null, skippedNoCompletion };
  const op = operator === '|' ? '|' : '&';
  return { json: JSON.stringify({ op, c: conditions, showc }), skippedNoCompletion };
}

function buildCompletionFields(data: Record<string, unknown>): {
  completion: number;
  completionview: number;
  completionusegrade: number;
  completionpassgrade: number;
  completionexpected: number;
} {
  return {
    completion: Number(data.completion ?? 0),
    completionview: data.completion === 2 && data.completionview ? 1 : 0,
    completionusegrade: data.completion === 2 && data.completionusegrade ? 1 : 0,
    completionpassgrade: data.completion === 2 && data.completionusegrade && data.completionpassgrade ? 1 : 0,
    completionexpected: data.completion === 2 && data.completionexpected
      ? dateToTimestamp(data.completionexpected as string)
      : 0,
  };
}

function buildCourseData(data: Record<string, unknown>, sectionCount: number) {
  return {
    fullname: String(data.fullname || 'Untitled Course'),
    shortname: String(data.shortname || 'COURSE'),
    categoryid: Number(data.category) || 1,
    summary: String(data.summary || ''),
    format: String(data.format || 'topics'),
    startdate: dateToTimestamp(data.startdate as string | undefined),
    enddate: dateToTimestamp(data.enddate as string | undefined),
    visible: data.visible !== false ? 1 : 0,
    numsections: sectionCount,
  };
}

async function syncBookChapters(
  config: MoodleConnectionConfig,
  cmid: number,
  chaptersData: unknown,
): Promise<void> {
  const raw = Array.isArray(chaptersData) ? chaptersData : [];
  const chapters = (raw as Array<Record<string, unknown>>).map((ch) => ({
    title:      String(ch.title      || ''),
    content:    String(ch.content    || ''),
    subchapter: ch.subchapter ? 1 : 0 as 0 | 1,
    hidden:     0 as 0 | 1,
  }));
  await updateBookChapters(config, cmid, chapters);
}

async function syncLessonPages(
  config: MoodleConnectionConfig,
  cmid: number,
  pagesData: unknown,
): Promise<void> {
  const raw = Array.isArray(pagesData) ? pagesData : [];
  const QTYPE: Record<string, number> = { content: 20, multichoice: 3, truefalse: 2, shortanswer: 1 };
  const pages: LessonPageData[] = (raw as Array<Record<string, unknown>>).map((p) => ({
    title:   String(p.title   || ''),
    content: String(p.content || ''),
    type:    QTYPE[String(p.type || 'content')] ?? 20,
    answers: (Array.isArray(p.answers) ? p.answers as Array<Record<string, unknown>> : []).map((a) => ({
      text:     String(a.text     || ''),
      response: String(a.response || ''),
      correct:  a.correct ? 1 : 0 as 0 | 1,
      jumpto:   Number(a.jumpto ?? -1),
    })),
  }));
  await updateLessonPages(config, cmid, pages);
}

async function syncFeedbackItems(
  config: MoodleConnectionConfig,
  cmid: number,
  itemsData: unknown,
): Promise<void> {
  const raw = Array.isArray(itemsData) ? itemsData : [];
  const items: FeedbackItemData[] = (raw as Array<Record<string, unknown>>).map((item) => {
    const type = String(item.type || 'text');
    let presentation = String(item.presentation || '');
    if ((type === 'multichoice' || type === 'multichoice_rated') && Array.isArray(item.options)) {
      presentation = (item.options as string[]).map((o) => `r>>>>${ o}`).join('|');
    } else if (type === 'numeric') {
      presentation = `${item.min ?? 0}|${item.max ?? 100}`;
    }
    return {
      type,
      name:         String(item.name || ''),
      presentation,
      required:     item.required ? 1 : 0 as 0 | 1,
    };
  });
  await updateFeedbackItems(config, cmid, items);
}

async function syncQuizQuestions(
  config: MoodleConnectionConfig,
  cmid: number,
  questionsData: unknown,
): Promise<void> {
  const raw = Array.isArray(questionsData) ? questionsData : [];
  const GRADE_MAP: Record<string, number> = { highest: 1, average: 2, first: 3, last: 4 };

  const questions: QuizQuestionInput[] = (raw as Array<Record<string, unknown>>).map((q) => {
    const type = String(q.type || 'multichoice') as QuizQuestionInput['type'];
    const base: QuizQuestionInput = {
      type,
      text: String(q.text || ''),
      points: Number(q.points ?? 1),
      generalfeedback: String(q.generalfeedback || ''),
    };

    if (type === 'multichoice') {
      const answers = (Array.isArray(q.answers) ? q.answers : []) as Array<Record<string, unknown>>;
      base.single = q.single === false || q.single === 0 ? 0 : 1;
      base.answers = answers.map((a) => ({
        text: String(a.text || ''),
        correct: a.correct ? 1 : 0 as 0 | 1,
        feedback: String(a.feedback || ''),
      }));
    } else if (type === 'truefalse') {
      base.correct = q.correct ? 1 : 0 as 0 | 1;
      base.feedbacktrue  = String(q.feedbackTrue  || q.feedbacktrue  || '');
      base.feedbackfalse = String(q.feedbackFalse || q.feedbackfalse || '');
    } else if (type === 'shortanswer') {
      const answers = (Array.isArray(q.answers) ? q.answers : []) as Array<Record<string, unknown>>;
      base.answers = answers.map((a) => ({
        text: String(a.text || ''),
        correct: 1 as 0 | 1,
        feedback: String(a.feedback || ''),
      }));
    } else if (type === 'numerical') {
      base.answer    = Number(q.answer    ?? 0);
      base.tolerance = Number(q.tolerance ?? 0);
    }

    return base;
  });

  await createQuizContent(config, cmid, questions);
  void GRADE_MAP; // suppress unused warning
}

function buildModuleOptions(node: BackendNode, fileItemIds?: Map<string, number>): {
  moduletype: string;
  options: Record<string, unknown>;
} | null {
  const { type, data } = node;

  if (type === 'activity') {
    const subtype = String(data.subtype);
    if (subtype === 'assign') {
      return {
        moduletype: 'assign',
        options: {
          duedate: dateToTimestamp(data.duedate as string | undefined),
          cutoffdate: dateToTimestamp(data.cutoffdate as string | undefined),
          maxgrade: Number(data.maxgrade) || 100,
          submissiontype: String(data.submissiontype || 'online_text'),
        },
      };
    }
    if (subtype === 'quiz') {
      const GRADE_MAP: Record<string, number> = { highest: 1, average: 2, first: 3, last: 4 };
      return {
        moduletype: 'quiz',
        options: {
          timeopen:       dateToTimestamp(data.timeopen as string | undefined),
          timeclose:      dateToTimestamp(data.timeclose as string | undefined),
          timelimit:      Number(data.timelimit) || 0,
          attempts:       Number(data.attempts) || 0,
          grademethod:    GRADE_MAP[String(data.grademethod)] ?? 1,
          shuffleanswers: data.shuffleanswers ? 1 : 0,
        },
      };
    }
    if (subtype === 'forum') {
      return {
        moduletype: 'forum',
        options: {
          type: String(data.type || 'general'),
          maxattachments: Number(data.maxattachments) || 9,
        },
      };
    }
    if (subtype === 'h5p') {
      return {
        moduletype: 'h5pactivity',
        options: {
          enabletracking: data.enabletracking !== false ? 1 : 0,
          grademethod: Number(data.grademethod ?? 1),
        },
      };
    }
    if (subtype === 'glossary') {
      return {
        moduletype: 'glossary',
        options: {
          displayformat: String(data.displayformat || 'dictionary'),
          globalglossary: data.globalglossary ? 1 : 0,
          allowcomments: data.allowcomments ? 1 : 0,
        },
      };
    }
    if (subtype === 'scorm') {
      return {
        moduletype: 'scorm',
        options: {
          maxattempt: Number(data.maxattempt ?? 0),
          grademethod: Number(data.grademethod ?? 1),
          whatgrade: Number(data.whatgrade ?? 0),
          maxgrade: Number(data.maxgrade ?? 100),
        },
      };
    }
    if (subtype === 'lesson') {
      return {
        moduletype: 'lesson',
        options: {
          maxattempts: Number(data.maxattempts ?? 0),
          timelimit: Number(data.timelimit ?? 0),
          retake: data.retake ? 1 : 0,
          review: data.review ? 1 : 0,
        },
      };
    }
    if (subtype === 'choice') {
      return {
        moduletype: 'choice',
        options: {
          allowupdate: data.allowupdate !== false ? 1 : 0,
          showresults: Number(data.showresults ?? 1),
        },
      };
    }
    if (subtype === 'feedback') {
      return {
        moduletype: 'feedback',
        options: {
          anonymous: Number(data.anonymous ?? 1),
          multiple_submit: data.multiple_submit ? 1 : 0,
        },
      };
    }
  }

  if (type === 'resource') {
    const subtype = String(data.subtype);
    if (subtype === 'url') {
      return {
        moduletype: 'url',
        options: {
          externalurl: String(data.url || ''),
          display: Number(data.display) || 0,
        },
      };
    }
    if (subtype === 'page') {
      return {
        moduletype: 'page',
        options: {
          content: String(data.content || ''),
          intro: String(data.description || ''),
          printintro: data.printintro ? 1 : 0,
          printlastmodified: data.printlastmodified !== false ? 1 : 0,
          displaydescription: data.displaydescription ? 1 : 0,
        },
      };
    }
    if (subtype === 'file') {
      const itemId = fileItemIds?.get(node.id);
      if (!itemId) return null; // no file attached yet
      return {
        moduletype: 'resource',
        options: { itemid: itemId, display: 0 },
      };
    }
    if (subtype === 'book') {
      return {
        moduletype: 'book',
        options: { numbering: Number(data.numbering ?? 1) },
      };
    }
  }

  return null;
}

/**
 * Detect circular restriction dependencies using DFS.
 * Returns human-readable descriptions of each cycle found.
 */
function detectCircularRestrictions(nodes: BackendNode[]): string[] {
  // Build adjacency: nodeId → [nodeIds it depends on via restrictions]
  const deps = new Map<string, string[]>();
  const nameMap = new Map<string, string>();
  for (const node of nodes) {
    nameMap.set(node.id, String(node.data.name || node.data.fullname || node.id));
    const restrictions = Array.isArray(node.data.restrictions)
      ? (node.data.restrictions as Array<Record<string, unknown>>)
      : [];
    const depIds = restrictions
      .filter((r) => (r.type === 'completion' || r.type === 'grade') && r.nodeId)
      .map((r) => String(r.nodeId));
    deps.set(node.id, depIds);
  }

  const cycles: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  const dfs = (nodeId: string) => {
    if (inStack.has(nodeId)) {
      // Found a cycle — extract it from the current stack
      const cycleStart = stack.indexOf(nodeId);
      const cycle = [...stack.slice(cycleStart), nodeId]
        .map((id) => nameMap.get(id) || id)
        .join(' → ');
      cycles.push(cycle);
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    inStack.add(nodeId);
    stack.push(nodeId);
    for (const depId of deps.get(nodeId) ?? []) {
      dfs(depId);
    }
    stack.pop();
    inStack.delete(nodeId);
  };

  for (const nodeId of deps.keys()) {
    dfs(nodeId);
  }

  return cycles;
}

export async function exportProject(
  userId: string,
  projectId: string,
): Promise<ExportReport> {
  // 1. Load project from Supabase
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projErr || !project) {
    throw new Error('Project not found or access denied');
  }

  const moodleConfig = project.moodle_config as {
    url: string;
    token: string;
    courseId?: number | null;
  } | null;

  if (!moodleConfig?.url || !moodleConfig?.token) {
    throw new Error('Moodle connection not configured for this project');
  }

  const config: MoodleConnectionConfig = {
    url: moodleConfig.url,
    token: moodleConfig.token,
  };

  const nodes = (project.nodes || []) as BackendNode[];
  const edges = (project.edges || []) as BackendEdge[];

  // 2a. Detect circular restriction dependencies (A requires B requires A)
  const circularErrors = detectCircularRestrictions(nodes);
  if (circularErrors.length > 0) {
    throw new Error(
      `Restrictions circulaires détectées :\n${circularErrors.map((c) => `  • ${c}`).join('\n')}\nCorrigez ces dépendances avant d'exporter.`,
    );
  }

  // 2. Find the course node
  const courseNode = nodes.find((n) => n.type === 'course');
  if (!courseNode) throw new Error('No course node found in the mindmap');

  // 3. Load existing mappings
  const { data: existingMappings } = await supabase
    .from('moodle_mappings')
    .select('*')
    .eq('project_id', projectId);

  const mappings = new Map<string, MoodleMapping>();
  for (const m of existingMappings || []) {
    mappings.set(m.node_id, m as MoodleMapping);
  }

  const report: ExportReport = {
    courseId: 0,
    courseUrl: '',
    courseName: String(courseNode.data.fullname || 'Untitled'),
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const upsertMapping = async (
    nodeId: string,
    moodleType: 'course' | 'section' | 'module',
    moodleId: number,
    checksum: string,
  ) => {
    await supabase.from('moodle_mappings').upsert({
      project_id: projectId,
      node_id: nodeId,
      moodle_type: moodleType,
      moodle_id: moodleId,
      last_synced: new Date().toISOString(),
      checksum,
    });
    mappings.set(nodeId, { project_id: projectId, node_id: nodeId, moodle_type: moodleType, moodle_id: moodleId, checksum });
  };

  // 4. Get sections (direct children of course node)
  const sectionNodes = sortByPosition(getChildren(courseNode.id, edges, nodes));

  // 5. Create or update the Moodle course
  const courseChecksum = computeChecksum(courseNode.data);
  const existingCourseMapping = mappings.get(courseNode.id);
  let moodleCourseId = moodleConfig.courseId ?? existingCourseMapping?.moodle_id ?? 0;

  const courseData = buildCourseData(courseNode.data, sectionNodes.length || 1);

  try {
    if (moodleCourseId) {
      if (existingCourseMapping?.checksum !== courseChecksum) {
        await updateCourse(config, moodleCourseId, courseData);
        report.updated++;
      }
    } else {
      const created = await createCourse(config, courseData);
      moodleCourseId = created.id;
      report.created++;
    }
    await upsertMapping(courseNode.id, 'course', moodleCourseId, courseChecksum);
    report.courseId = moodleCourseId;
    report.courseUrl = `${config.url}/course/view.php?id=${moodleCourseId}`;
  } catch (err) {
    const msg = err instanceof MoodleError ? err.message : String(err);
    report.errors.push({ nodeId: courseNode.id, nodeName: courseData.fullname, error: msg });
    throw new Error(`Course creation failed: ${msg}`);
  }

  // Update project with the courseId
  await supabase
    .from('projects')
    .update({
      moodle_config: { ...moodleConfig, courseId: moodleCourseId },
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  // 6. Pre-upload file resources to Moodle draft areas (needs moodleCourseId for capability check)
  const fileItemIds = new Map<string, number>();
  const fileNodes = nodes.filter(
    (n) => n.type === 'resource' && (n.data as Record<string, unknown>).subtype === 'file',
  );
  for (const fileNode of fileNodes) {
    const data = fileNode.data as Record<string, unknown>;
    if (!data.filedata || !data.filename) continue;
    try {
      const itemId = await uploadFileToDraft(
        config,
        moodleCourseId,
        String(data.filename),
        String(data.filedata),
      );
      fileItemIds.set(fileNode.id, itemId);
    } catch (err) {
      const msg = err instanceof MoodleError ? err.message : String(err);
      report.errors.push({ nodeId: fileNode.id, nodeName: String(data.name || fileNode.id), error: `File upload failed: ${msg}` });
    }
  }

  // 7. Create or update sections
  for (let i = 0; i < sectionNodes.length; i++) {
    const sectionNode = sectionNodes[i];
    const sectionNum = i + 1; // Section 0 is "General", our sections start at 1
    const sectionName = String(sectionNode.data.name || `Section ${sectionNum}`);
    const sectionSummary = String(sectionNode.data.summary || '');
    const sectionChecksum = computeChecksum(sectionNode.data);
    const existingSection = mappings.get(sectionNode.id);

    try {
      const result = await ensureSection(config, moodleCourseId, sectionNum, sectionName, sectionSummary);
      if (existingSection) {
        if (existingSection.checksum !== sectionChecksum) report.updated++;
      } else {
        report.created++;
      }
      await upsertMapping(sectionNode.id, 'section', result.sectionnum, sectionChecksum);
    } catch (err) {
      const msg = err instanceof MoodleError ? err.message : String(err);
      report.errors.push({ nodeId: sectionNode.id, nodeName: sectionName, error: msg });
      continue; // Still try to process other sections
    }

    // 7. Create or update modules in this section
    const moduleNodes = sortByPosition(getChildren(sectionNode.id, edges, nodes));
    for (const moduleNode of moduleNodes) {
      const nodeName = String(moduleNode.data.name || 'Untitled');
      const moduleOpts = buildModuleOptions(moduleNode, fileItemIds);

      if (!moduleOpts) {
        report.skipped++;
        report.errors.push({
          nodeId: moduleNode.id,
          nodeName,
          error: 'No file attached to this resource node (skipped)',
        });
        continue;
      }

      const moduleChecksum = computeChecksum(moduleNode.data);
      const existingModule = mappings.get(moduleNode.id);
      const completionFields = buildCompletionFields(moduleNode.data);
      const restrictions = (moduleNode.data.restrictions ?? []) as Restriction[];
      const operator = moduleNode.data.restrictionOperator as string | undefined;
      const { json: availabilityJson, skippedNoCompletion } = buildAvailabilityJson(restrictions, mappings, nodes, operator);
      const availability = availabilityJson ?? '';
      for (const refName of skippedNoCompletion) {
        report.errors.push({
          nodeId: moduleNode.id,
          nodeName,
          error: `Restriction ignorée : "${refName}" n'a pas de suivi d'achèvement activé. Activez l'achèvement sur ce module pour que la restriction fonctionne.`,
        });
      }

      const doCreate = async () => {
        const result = await createModule(config, {
          courseid: moodleCourseId,
          sectionnum: sectionNum,
          moduletype: moduleOpts.moduletype,
          name: nodeName,
          intro: String(moduleNode.data.description || ''),
          visible: moduleNode.data.visible !== false ? 1 : 0,
          options: moduleOpts.options,
          ...completionFields,
          ...(availability !== '' ? { availability } : {}),
        });
        if (moduleOpts.moduletype === 'book') {
          await syncBookChapters(config, result.cmid, moduleNode.data.chapters);
        }
        if (moduleOpts.moduletype === 'quiz') {
          await syncQuizQuestions(config, result.cmid, moduleNode.data.questions);
        }
        if (moduleOpts.moduletype === 'lesson') {
          await syncLessonPages(config, result.cmid, moduleNode.data.pages);
        }
        if (moduleOpts.moduletype === 'feedback') {
          await syncFeedbackItems(config, result.cmid, moduleNode.data.items);
        }
        report.created++;
        await upsertMapping(moduleNode.id, 'module', result.cmid, moduleChecksum);
      };

      try {
        if (existingModule?.moodle_id) {
          let staleMapping = false;
          try {
            await updateModule(config, existingModule.moodle_id, {
              name: nodeName,
              intro: String(moduleNode.data.description || ''),
              visible: moduleNode.data.visible !== false ? 1 : 0,
              options: existingModule.checksum !== moduleChecksum ? moduleOpts.options : undefined,
              ...completionFields,
              availability,
            });
          } catch (updateErr) {
            // If the cmid no longer exists in Moodle (stale mapping), recreate.
            if (updateErr instanceof MoodleError && updateErr.errorcode === 'invalidcoursemodule') {
              staleMapping = true;
            } else {
              throw updateErr;
            }
          }

          if (staleMapping) {
            await doCreate();
          } else {
            if (existingModule.checksum !== moduleChecksum) {
              if (moduleOpts.moduletype === 'book') {
                await syncBookChapters(config, existingModule.moodle_id, moduleNode.data.chapters);
              }
              if (moduleOpts.moduletype === 'quiz') {
                await syncQuizQuestions(config, existingModule.moodle_id, moduleNode.data.questions);
              }
              if (moduleOpts.moduletype === 'lesson') {
                await syncLessonPages(config, existingModule.moodle_id, moduleNode.data.pages);
              }
              if (moduleOpts.moduletype === 'feedback') {
                await syncFeedbackItems(config, existingModule.moodle_id, moduleNode.data.items);
              }
              report.updated++;
            } else {
              if (moduleOpts.moduletype === 'book') {
                await syncBookChapters(config, existingModule.moodle_id, moduleNode.data.chapters);
              }
              if (moduleOpts.moduletype === 'quiz') {
                await syncQuizQuestions(config, existingModule.moodle_id, moduleNode.data.questions);
              }
              if (moduleOpts.moduletype === 'lesson') {
                await syncLessonPages(config, existingModule.moodle_id, moduleNode.data.pages);
              }
              if (moduleOpts.moduletype === 'feedback') {
                await syncFeedbackItems(config, existingModule.moodle_id, moduleNode.data.items);
              }
              report.skipped++;
            }
            await upsertMapping(moduleNode.id, 'module', existingModule.moodle_id, moduleChecksum);
          }
        } else {
          await doCreate();
        }
      } catch (err) {
        const msg = err instanceof MoodleError ? err.message : String(err);
        report.errors.push({ nodeId: moduleNode.id, nodeName, error: msg });
      }
    }
  }

  // Second pass: re-apply availability for modules whose restrictions reference
  // other modules created in the same export run (cmids now resolved).
  for (const sectionNode of sectionNodes) {
    const moduleNodes = sortByPosition(getChildren(sectionNode.id, edges, nodes));
    for (const moduleNode of moduleNodes) {
      const restrictions = (moduleNode.data.restrictions ?? []) as Restriction[];
      if (restrictions.length === 0) continue;
      const { json: availabilityJson2 } = buildAvailabilityJson(restrictions, mappings, nodes, moduleNode.data.restrictionOperator as string | undefined);
      if (!availabilityJson2) continue;
      const existingModule = mappings.get(moduleNode.id);
      if (!existingModule?.moodle_id) continue;
      try {
        await updateModule(config, existingModule.moodle_id, {
          name: String(moduleNode.data.name || 'Untitled'),
          intro: String(moduleNode.data.description || ''),
          visible: moduleNode.data.visible !== false ? 1 : 0,
          ...buildCompletionFields(moduleNode.data),
          availability: availabilityJson2,
        });
      } catch {
        // Non-fatal: availability update failure doesn't block report
      }
    }
  }

  return report;
}
