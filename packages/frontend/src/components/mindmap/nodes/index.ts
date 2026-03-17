import type { NodeTypes } from 'reactflow';
import { CourseNode } from './CourseNode';
import { SectionNode } from './SectionNode';
import { ResourceNode } from './ResourceNode';
import { ActivityNode } from './ActivityNode';

export const nodeTypes: NodeTypes = {
  course: CourseNode,
  section: SectionNode,
  resource: ResourceNode,
  activity: ActivityNode,
};

export { CourseNode, SectionNode, ResourceNode, ActivityNode };
