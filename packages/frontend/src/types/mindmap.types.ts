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

export interface FileResourceData {
  subtype: 'file';
  name: string;
  description?: string;
  filename?: string;      // original file name
  filedata?: string;      // base64-encoded content
  filesize?: number;      // bytes
  filetype?: string;      // MIME type
  visible: boolean;
}

export interface UrlResourceData {
  subtype: 'url';
  name: string;
  description?: string;
  url: string;
  display?: 'auto' | 'embed' | 'open' | 'popup';
  visible: boolean;
}

export interface PageResourceData {
  subtype: 'page';
  name: string;
  description?: string;
  content: string;
  visible: boolean;
}

export type ResourceNodeData = FileResourceData | UrlResourceData | PageResourceData;

// --- Activity nodes ---

export type ActivitySubtype = 'assign' | 'quiz' | 'forum';

export interface AssignActivityData {
  subtype: 'assign';
  name: string;
  description?: string;
  duedate?: string;
  cutoffdate?: string;
  maxgrade: number;
  submissiontype: 'online_text' | 'file' | 'both';
  visible: boolean;
}

export interface QuizActivityData {
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

export interface ForumActivityData {
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
