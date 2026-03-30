import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { ResourceNodeData } from '@/types/mindmap.types';
import { useMindmapStore } from '@/stores/mindmap-store';

const SUBTYPE_META: Record<string, { icon: string; label: string }> = {
  file: { icon: '📄', label: 'Fichier' },
  url: { icon: '🔗', label: 'URL' },
  page: { icon: '📝', label: 'Page' },
};

const SUBTYPE_META_RESOURCE: Record<string, { icon: string; label: string }> = {
  file:     { icon: '📄', label: 'Fichier' },
  url:      { icon: '🔗', label: 'URL' },
  page:     { icon: '📝', label: 'Page' },
  book:     { icon: '📚', label: 'Livre' },
};

function ResourceNodeComponent({ id, data, selected }: NodeProps<ResourceNodeData>) {
  const meta = SUBTYPE_META_RESOURCE[data.subtype] ?? { icon: '📄', label: data.subtype };
  const hasBranchChild = useMindmapStore((s) =>
    s.edges.some((e) => e.source === id && s.nodes.find((n) => n.id === e.target)?.type === 'branch'),
  );
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
          ${selected ? 'border-amber-400 shadow-node-hover ring-2 ring-amber-200' : 'border-resource-border shadow-node hover:shadow-node-hover'}
        `}
      >
        <div className="h-0.5 bg-gradient-to-r from-amber-400 to-orange-400 rounded-t-xl" />

        <div className="px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-resource-light flex items-center justify-center flex-shrink-0">
              <span className="text-base leading-none">{meta.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">
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
          className="!w-2.5 !h-2.5 !bg-amber-400 !border-2 !border-white !shadow-sm"
        />
        {hasBranchChild && (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-2.5 !h-2.5 !bg-amber-400 !border-2 !border-white !shadow-sm"
          />
        )}
      </div>
    </div>
  );
}

export const ResourceNode = memo(ResourceNodeComponent);
