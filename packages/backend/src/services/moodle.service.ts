import { createHash } from 'crypto';

export interface MoodleConnectionConfig {
  url: string;
  token: string;
}

export class MoodleError extends Error {
  constructor(
    public readonly errorcode: string,
    message: string,
  ) {
    super(message);
    this.name = 'MoodleError';
  }
}

// Flatten a nested JS object to Moodle's URL-encoded param format.
// { courses: [{ fullname: 'x' }] } → "courses[0][fullname]=x"
function flattenToParams(obj: object): URLSearchParams {
  const params = new URLSearchParams();

  function flatten(value: unknown, key: string) {
    if (Array.isArray(value)) {
      value.forEach((item, i) => flatten(item, `${key}[${i}]`));
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        flatten(v, `${key}[${k}]`);
      }
    } else if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    flatten(value, key);
  }
  return params;
}

export async function moodleCall<T>(
  config: MoodleConnectionConfig,
  wsfunction: string,
  params: object = {},
): Promise<T> {
  const body = flattenToParams(params);
  body.append('wstoken', config.token);
  body.append('wsfunction', wsfunction);
  body.append('moodlewsrestformat', 'json');

  const endpoint = `${config.url.replace(/\/$/, '')}/webservice/rest/server.php`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new MoodleError(
      'MOODLE_UNREACHABLE',
      `Cannot reach Moodle at ${config.url}: ${(err as Error).message}`,
    );
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new MoodleError(
      'INVALID_RESPONSE',
      `Moodle returned non-JSON (HTTP ${res.status}) — check the URL`,
    );
  }

  const data = (await res.json()) as Record<string, unknown>;
  if (data.exception) {
    throw new MoodleError(
      (data.errorcode as string) ?? 'UNKNOWN',
      (data.message as string) ?? 'Unknown Moodle error',
    );
  }

  return data as T;
}

// ─── Site Info ────────────────────────────────────────────────────────────────

export interface MoodleSiteInfo {
  sitename: string;
  username: string;
  moodleversion: string;
  release: string;
  functions: Array<{ name: string; version: string }>;
}

export async function getSiteInfo(config: MoodleConnectionConfig): Promise<MoodleSiteInfo> {
  return moodleCall<MoodleSiteInfo>(config, 'core_webservice_get_site_info');
}

export function checkFunctions(siteInfo: MoodleSiteInfo, required: string[]): string[] {
  const available = new Set(siteInfo.functions.map((f) => f.name));
  return required.filter((f) => !available.has(f));
}

// ─── Categories ───────────────────────────────────────────────────────────────

export interface MoodleCategory {
  id: number;
  name: string;
  parent: number;
  coursecount: number;
  depth: number;
  path: string;
}

export async function getCategories(
  config: MoodleConnectionConfig,
): Promise<MoodleCategory[]> {
  return moodleCall<MoodleCategory[]>(config, 'core_course_get_categories', {
    addsubcategories: 1,
  });
}

// ─── Courses ──────────────────────────────────────────────────────────────────

export interface MoodleCourseInput {
  fullname: string;
  shortname: string;
  categoryid: number;
  summary: string;
  format: string;
  startdate: number;
  enddate: number;
  visible: number;
  numsections: number;
}

export async function createCourse(
  config: MoodleConnectionConfig,
  courseData: MoodleCourseInput,
): Promise<{ id: number; shortname: string }> {
  const result = await moodleCall<Array<{ id: number; shortname: string }>>(
    config,
    'core_course_create_courses',
    { courses: [courseData] },
  );
  return result[0];
}

export async function updateCourse(
  config: MoodleConnectionConfig,
  courseId: number,
  courseData: Partial<MoodleCourseInput>,
): Promise<void> {
  await moodleCall(config, 'core_course_update_courses', {
    courses: [{ id: courseId, ...courseData }],
  });
}

// ─── Course Contents (for import) ─────────────────────────────────────────────

export interface MoodleModuleInfo {
  id: number;
  name: string;
  modname: string;
  visible: number;
  intro?: string;
  url?: string;
  contents?: unknown[];
}

export interface MoodleSectionInfo {
  id: number;
  section: number;
  name: string;
  summary: string;
  visible: number;
  modules: MoodleModuleInfo[];
}

export async function getCourseContents(
  config: MoodleConnectionConfig,
  courseId: number,
): Promise<MoodleSectionInfo[]> {
  return moodleCall<MoodleSectionInfo[]>(config, 'core_course_get_contents', {
    courseid: courseId,
  });
}

export async function getCourse(
  config: MoodleConnectionConfig,
  courseId: number,
): Promise<Array<{
  id: number;
  fullname: string;
  shortname: string;
  categoryid: number;
  summary: string;
  format: string;
  startdate: number;
  enddate: number;
  visible: number;
}>> {
  return moodleCall(config, 'core_course_get_courses', { options: { ids: [courseId] } });
}

// ─── Plugin: local_kaggu ─────────────────────────────────────────────────────

export interface KagguSectionResult {
  sectionid: number;
  sectionnum: number;
}

export async function ensureSection(
  config: MoodleConnectionConfig,
  courseid: number,
  sectionnum: number,
  name: string,
  summary: string,
): Promise<KagguSectionResult> {
  return moodleCall<KagguSectionResult>(config, 'local_kaggu_ensure_section', {
    courseid,
    sectionnum,
    name,
    summary,
  });
}

export interface KagguModuleInput {
  courseid: number;
  sectionnum: number;
  moduletype: string;
  name: string;
  intro: string;
  visible: number;
  options: Record<string, unknown>;
}

export interface KagguModuleResult {
  cmid: number;
  moduletype: string;
  instanceid: number;
}

export async function createModule(
  config: MoodleConnectionConfig,
  moduleData: KagguModuleInput,
): Promise<KagguModuleResult> {
  return moodleCall<KagguModuleResult>(config, 'local_kaggu_create_module', moduleData);
}

export async function updateModule(
  config: MoodleConnectionConfig,
  cmid: number,
  moduleData: Partial<KagguModuleInput>,
): Promise<void> {
  await moodleCall(config, 'local_kaggu_update_module', { cmid, ...moduleData });
}

export async function deleteModule(
  config: MoodleConnectionConfig,
  cmid: number,
): Promise<void> {
  await moodleCall(config, 'local_kaggu_delete_module', { cmid });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function computeChecksum(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export function dateToTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const ts = Math.floor(new Date(dateStr).getTime() / 1000);
  return isNaN(ts) ? 0 : ts;
}

/** Map a Moodle module name to our node type/subtype */
export function moodleModToNodeType(modname: string): {
  type: 'resource' | 'activity';
  subtype: string;
} {
  const resources: Record<string, string> = {
    url: 'url',
    page: 'page',
    resource: 'file',
    folder: 'file',
  };
  const activities: Record<string, string> = {
    assign: 'assign',
    quiz: 'quiz',
    forum: 'forum',
    choice: 'forum',
    scorm: 'assign',
    lesson: 'assign',
    h5pactivity: 'assign',
  };
  if (resources[modname]) return { type: 'resource', subtype: resources[modname] };
  if (activities[modname]) return { type: 'activity', subtype: activities[modname] };
  return { type: 'activity', subtype: 'assign' };
}
