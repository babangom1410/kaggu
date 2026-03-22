import { supabase } from '../lib/supabase';
import {
  MoodleError,
  MoodleConnectionConfig,
  createCourse,
  updateCourse,
  ensureSection,
  createModule,
  updateModule,
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
      return {
        moduletype: 'quiz',
        options: {
          timeopen: dateToTimestamp(data.timeopen as string | undefined),
          timeclose: dateToTimestamp(data.timeclose as string | undefined),
          timelimit: Number(data.timelimit) || 0,
          attempts: Number(data.attempts) || 0,
          grademethod: Number(data.grademethod) || 1,
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
  }

  return null;
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

      try {
        if (existingModule?.moodle_id) {
          if (existingModule.checksum !== moduleChecksum) {
            await updateModule(config, existingModule.moodle_id, {
              name: nodeName,
              intro: String(moduleNode.data.description || ''),
              visible: moduleNode.data.visible !== false ? 1 : 0,
              options: moduleOpts.options,
            });
            report.updated++;
          }
          await upsertMapping(moduleNode.id, 'module', existingModule.moodle_id, moduleChecksum);
        } else {
          const result = await createModule(config, {
            courseid: moodleCourseId,
            sectionnum: sectionNum,
            moduletype: moduleOpts.moduletype,
            name: nodeName,
            intro: String(moduleNode.data.description || ''),
            visible: moduleNode.data.visible !== false ? 1 : 0,
            options: moduleOpts.options,
          });
          report.created++;
          await upsertMapping(moduleNode.id, 'module', result.cmid, moduleChecksum);
        }
      } catch (err) {
        const msg = err instanceof MoodleError ? err.message : String(err);
        report.errors.push({ nodeId: moduleNode.id, nodeName, error: msg });
      }
    }
  }

  return report;
}
