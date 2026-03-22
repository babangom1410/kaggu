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

export type ResourceSubtype = 'file' | 'url' | 'page';

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

export type ResourceNodeData = FileResourceData | UrlResourceData | PageResourceData;

// --- Activity nodes ---

export type ActivitySubtype = 'assign' | 'quiz' | 'forum';

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

export type ActivityNodeData = AssignActivityData | QuizActivityData | ForumActivityData;

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
  courseId: number | null;
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
