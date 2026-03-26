import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CourseNodeData } from '@/types/mindmap.types';
import { useMindmapStore } from '@/stores/mindmap-store';

const FORMAT_LABELS: Record<string, string> = {
  topics: 'Par thèmes',
  weeks: 'Par semaines',
  social: 'Social',
};

function CourseNodeComponent({ id, data, selected }: NodeProps<CourseNodeData>) {
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
        bg-white rounded-2xl border transition-all duration-200 min-w-[220px]
        ${selected ? 'border-blue-400 shadow-node-hover ring-2 ring-blue-200' : 'border-course-border shadow-node hover:shadow-node-hover'}
      `}
    >
      {/* Colored top accent bar */}
      <div className="h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-t-2xl" />

      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-9 h-9 rounded-xl bg-course-light flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-lg leading-none">🎓</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">
              Cours
            </div>
            <div className="font-semibold text-slate-800 text-sm leading-tight truncate">
              {data.fullname}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{data.shortname}</div>
          </div>

          {/* Collapse toggle */}
          {childCount > 0 && (
            <div className="relative flex-shrink-0 mt-0.5">
              <button
                onClick={toggle}
                className="w-7 h-7 rounded-lg flex items-center justify-center
                           text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title={collapsed ? 'Déplier tout' : 'Réduire tout'}
              >
                <svg
                  width="13" height="13" viewBox="0 0 12 12" fill="none"
                  className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
                >
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {collapsed && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none">
                  {childCount}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer chips */}
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">
            {FORMAT_LABELS[data.format] ?? data.format}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
              data.visible ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {data.visible ? 'Visible' : 'Masqué'}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white !shadow-sm"
      />
    </div>
  );
}

export const CourseNode = memo(CourseNodeComponent);
