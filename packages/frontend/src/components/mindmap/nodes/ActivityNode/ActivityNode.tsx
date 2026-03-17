import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { ActivityNodeData } from '@/types/mindmap.types';

const SUBTYPE_META: Record<string, { icon: string; label: string }> = {
  assign: { icon: '📋', label: 'Devoir' },
  quiz: { icon: '❓', label: 'Quiz' },
  forum: { icon: '💬', label: 'Forum' },
};

function ActivityNodeComponent({ data, selected }: NodeProps<ActivityNodeData>) {
  const meta = SUBTYPE_META[data.subtype] ?? { icon: '📋', label: data.subtype };

  return (
    <div
      className={`
        bg-white rounded-xl border transition-all duration-200 min-w-[165px]
        ${selected ? 'border-violet-400 shadow-node-hover ring-2 ring-violet-200' : 'border-activity-border shadow-node hover:shadow-node-hover'}
      `}
    >
      <div className="h-0.5 bg-gradient-to-r from-violet-400 to-purple-500 rounded-t-xl" />

      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-activity-light flex items-center justify-center flex-shrink-0">
            <span className="text-base leading-none">{meta.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider mb-0.5">
              {meta.label}
            </div>
            <div className="font-medium text-slate-700 text-sm leading-tight truncate">
              {data.name}
            </div>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-violet-400 !border-2 !border-white !shadow-sm"
      />
    </div>
  );
}

export const ActivityNode = memo(ActivityNodeComponent);
