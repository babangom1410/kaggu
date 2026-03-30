import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { BranchNodeData } from '@/types/mindmap.types';

const CONDITION_ICON: Record<BranchNodeData['conditionType'], string> = {
  grade: '⭐',
  completion: '✅',
  date: '📅',
};

function BranchNodeComponent({ data, selected }: NodeProps<BranchNodeData>) {
  const icon = CONDITION_ICON[data.conditionType ?? 'completion'];

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 72 }}>
      {/* Diamond shape */}
      <div
        className={`
          absolute inset-0 transition-all duration-200
          ${selected ? 'opacity-100' : 'opacity-90'}
        `}
        style={{
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          background: selected
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          boxShadow: selected
            ? '0 0 0 3px rgba(245,158,11,0.4), 0 4px 16px rgba(245,158,11,0.3)'
            : '0 2px 8px rgba(245,158,11,0.2)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-0.5 px-4 text-center">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-[10px] font-bold text-white leading-tight max-w-[80px] truncate">
          {data.label || 'Condition'}
        </span>
      </div>

      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-white !shadow-sm"
        style={{ top: -5 }}
      />

      {/* True branch (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="source-true"
        className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white !shadow-sm"
        style={{ right: -5 }}
      />
      <span
        className="absolute text-[9px] font-bold text-emerald-600 pointer-events-none"
        style={{ right: -28, top: '50%', transform: 'translateY(-50%)' }}
      >
        OUI
      </span>

      {/* False branch (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-false"
        className="!w-2.5 !h-2.5 !bg-red-400 !border-2 !border-white !shadow-sm"
        style={{ bottom: -5 }}
      />
      <span
        className="absolute text-[9px] font-bold text-red-500 pointer-events-none"
        style={{ bottom: -16, left: '50%', transform: 'translateX(-50%)' }}
      >
        NON
      </span>
    </div>
  );
}

export const BranchNode = memo(BranchNodeComponent);
