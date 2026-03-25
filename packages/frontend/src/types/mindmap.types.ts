import type { Node, Edge } from 'reactflow';

// --- Course node ---

export type CourseFormat = 'topics' | 'weeks' | 'social';

export interface CourseNodeData {
  fullname: string;
  shortname: string;
  summary?: string;
  format: CourseFormat;
  startdate?: string;
  enddate?: string;
  visible: boolean;
  category: number;
}

// --- Section node ---

export interface SectionNodeData {
  name: string;
  summary?: string;
  visible: boolean;
  position?: number;
}

// --- Resource nodes ---

export type ResourceSubtype = 'file' | 'url' | 'page' | 'book';

export interface FileResourceData extends CompletionSettings, RestrictionsSettings {
  subtype: 'file';
  name: string;
  description?: string;
  filename?: string;      // original file name
  filedata?: string;      // base64-encoded content
  filesize?: number;      // bytes
  filetype?: string;      // MIME type
  visible: boolean;
}

export interface UrlResourceData extends CompletionSettings, RestrictionsSettings {
  subtype: 'url';
  name: string;
  description?: string;
  url: string;
  display?: 'auto' | 'embed' | 'open' | 'popup';
  visible: boolean;
}

export interface PageResourceData extends CompletionSettings, RestrictionsSettings {
  subtype: 'page';
  name: string;
  description?: string;
  content: string;
  visible: boolean;
}

export interface BookResourceData extends CompletionSettings, RestrictionsSettings {
  subtype: 'book';
  name: string;
  description?: string;
  numbering?: 0 | 1 | 2 | 3; // 0=none, 1=numbers, 2=bullets, 3=indented
  visible: boolean;
}

export type ResourceNodeData = FileResourceData | UrlResourceData | PageResourceData | BookResourceData;

// --- Activity nodes ---

export type ActivitySubtype = 'assign' | 'quiz' | 'forum' | 'h5p' | 'glossary' | 'scorm' | 'lesson' | 'choice';

export interface AssignActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'assign';
  name: string;
  description?: string;
  duedate?: string;
  cutoffdate?: string;
  maxgrade: number;
  submissiontype: 'online_text' | 'file' | 'both';
  visible: boolean;
}

export interface QuizActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'quiz';
  name: string;
  description?: string;
  timeopen?: string;
  timeclose?: string;
  timelimit?: number;
  attempts?: number;
  grademethod?: 'highest' | 'average' | 'first' | 'last';
  visible: boolean;
}

export interface ForumActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'forum';
  name: string;
  description?: string;
  type: 'general' | 'single' | 'qanda' | 'blog' | 'eachuser';
  maxattachments?: number;
  visible: boolean;
}

export interface H5PActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'h5p';
  name: string;
  description?: string;
  enabletracking?: boolean;
  grademethod?: 1 | 2 | 3; // 1=max, 2=average, 3=last
  visible: boolean;
}

export interface GlossaryActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'glossary';
  name: string;
  description?: string;
  displayformat?: 'dictionary' | 'continuous' | 'compact' | 'fullwithoutauthor' | 'fullwithauthor';
  globalglossary?: boolean;
  allowcomments?: boolean;
  visible: boolean;
}

export interface ScormActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'scorm';
  name: string;
  description?: string;
  maxattempt?: number;       // 0 = unlimited
  maxgrade?: number;
  grademethod?: 0 | 1;      // 0=learning objects, 1=highest attempt
  whatgrade?: 0 | 1 | 2 | 3; // 0=highest, 1=average, 2=first, 3=last
  visible: boolean;
}

export interface LessonActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'lesson';
  name: string;
  description?: string;
  maxattempts?: number;
  timelimit?: number;        // seconds, 0=no limit
  retake?: boolean;
  review?: boolean;
  visible: boolean;
}

export interface ChoiceActivityData extends CompletionSettings, RestrictionsSettings {
  subtype: 'choice';
  name: string;
  description?: string;
  allowupdate?: boolean;
  showresults?: 0 | 1 | 2 | 3; // 0=never, 1=after answer, 2=after close, 3=always
  visible: boolean;
}

export type ActivityNodeData = AssignActivityData | QuizActivityData | ForumActivityData | H5PActivityData | GlossaryActivityData | ScormActivityData | LessonActivityData | ChoiceActivityData;

// --- Union types ---

export type MindmapNodeData =
  | CourseNodeData
  | SectionNodeData
  | ResourceNodeData
  | ActivityNodeData;

// --- Completion & restrictions (shared by resource + activity nodes) ---

export interface CompletionSettings {
  completion?: 0 | 1 | 2;        // 0=none, 1=manual, 2=automatic
  completionview?: boolean;       // must view
  completionusegrade?: boolean;   // must receive grade
  completionpassgrade?: boolean;  // must pass
  completionexpected?: string;    // ISO date
}

export type Restriction =
  | { type: 'date';       direction: '>=' | '<'; date: string }
  | { type: 'grade';      nodeId: string; min?: number; max?: number }
  | { type: 'completion'; nodeId: string; expected: 1 | 0 };

export interface RestrictionsSettings {
  restrictions?: Restriction[];
  restrictionOperator?: '&' | '|';
}

export type MindmapNodeType = 'course' | 'section' | 'resource' | 'activity';

export type MindmapNode = Node<MindmapNodeData>;
export type MindmapEdge = Edge;

// --- Project ---

export interface MoodleSiteInfo {
  sitename: string;
  username: string;
  moodleVersion: string;
  release: string;
  hasPlugin: boolean;
}

export interface MoodleConfig {
  url: string;
  token: string;
  courseId?: number | null;
  siteInfo?: MoodleSiteInfo;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  moodleConfig: MoodleConfig | null;
  nodes: MindmapNode[];
  edges: MindmapEdge[];
}
