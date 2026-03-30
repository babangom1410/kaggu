import type { NodeTypes } from 'reactflow';
import { CourseNode } from './CourseNode';
import { SectionNode } from './SectionNode';
import { ResourceNode } from './ResourceNode';
import { ActivityNode } from './ActivityNode';
import { BranchNode } from './BranchNode';

export const nodeTypes: NodeTypes = {
  course: CourseNode,
  section: SectionNode,
  resource: ResourceNode,
  activity: ActivityNode,
  branch: BranchNode,
};

export { CourseNode, SectionNode, ResourceNode, ActivityNode, BranchNode };
