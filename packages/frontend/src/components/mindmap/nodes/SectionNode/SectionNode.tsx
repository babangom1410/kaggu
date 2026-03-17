import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { SectionNodeData } from '@/types/mindmap.types';

function SectionNodeComponent({ data, selected }: NodeProps<SectionNodeData>) {
  return (
    <div
      className={`
        bg-white rounded-xl border transition-all duration-200 min-w-[180px]
        ${selected ? 'border-emerald-400 shadow-node-hover ring-2 ring-emerald-200' : 'border-section-border shadow-node hover:shadow-node-hover'}
      `}
    >
      <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-t-xl" />

      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-section-light flex items-center justify-center flex-shrink-0">
            <span className="text-base leading-none">📂</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-0.5">
              Section
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
        className="!w-2.5 !h-2.5 !bg-emerald-400 !border-2 !border-white !shadow-sm"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-emerald-400 !border-2 !border-white !shadow-sm"
      />
    </div>
  );
}

export const SectionNode = memo(SectionNodeComponent);
