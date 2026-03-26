import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { SectionNodeData } from '@/types/mindmap.types';
import { useMindmapStore } from '@/stores/mindmap-store';

function SectionNodeComponent({ id, data, selected }: NodeProps<SectionNodeData>) {
  const { updateNode, edges } = useMindmapStore();
  const childCount = edges.filter((e) => e.source === id).length;
  const collapsed = data.collapsed ?? false;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNode(id, { collapsed: !collapsed });
  };

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
            <span className="text-base leading-none">{collapsed ? '📁' : '📂'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-0.5">
              Section
            </div>
            <div className="font-medium text-slate-700 text-sm leading-tight truncate">
              {data.name}
            </div>
          </div>
          {childCount > 0 && (
            <div className="relative flex-shrink-0">
              <button
                onClick={toggle}
                className="w-6 h-6 rounded-md flex items-center justify-center
                           text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                title={collapsed ? 'Déplier' : 'Réduire'}
              >
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="none"
                  className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
                >
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {collapsed && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none">
                  {childCount}
                </span>
              )}
            </div>
          )}
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
