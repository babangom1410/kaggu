import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { ActivityNodeData } from '@/types/mindmap.types';

const SUBTYPE_META: Record<string, { icon: string; label: string }> = {
  assign:   { icon: '📋', label: 'Devoir' },
  quiz:     { icon: '❓', label: 'Quiz' },
  forum:    { icon: '💬', label: 'Forum' },
  h5p:      { icon: '🎮', label: 'H5P' },
  glossary: { icon: '📖', label: 'Glossaire' },
};

function ActivityNodeComponent({ data, selected }: NodeProps<ActivityNodeData>) {
  const meta = SUBTYPE_META[data.subtype] ?? { icon: '📋', label: data.subtype };
  const d = data as unknown as Record<string, unknown>;
  const completion = Number(d.completion ?? 0);
  const hasRestrictions = Array.isArray(d.restrictions) && (d.restrictions as unknown[]).length > 0;

  return (
    <div className="relative">
      {/* Completion badge */}
      {completion > 0 && (
        <div className={`absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full border-2 border-white shadow-sm
                         flex items-center justify-center text-[9px] font-bold
                         ${completion === 1 ? 'bg-teal-400 text-white' : 'bg-indigo-400 text-white'}`}
          title={completion === 1 ? 'Achèvement manuel' : 'Achèvement automatique'}>
          {completion === 1 ? '✓' : '⚡'}
        </div>
      )}
      {/* Restriction badge */}
      {hasRestrictions && (
        <div className="absolute -top-2 -left-2 z-10 w-5 h-5 rounded-full bg-amber-400 border-2 border-white shadow-sm
                         flex items-center justify-center text-[9px]"
          title="Accès restreint">
          🔒
        </div>
      )}

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
    </div>
  );
}

export const ActivityNode = memo(ActivityNodeComponent);
