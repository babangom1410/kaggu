import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { nodeTypes } from '../nodes';
import { useMindmapStore, generateNodeId } from '@/stores/mindmap-store';
import type { MindmapNode, Restriction } from '@/types/mindmap.types';

// Global keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+S)
function useKeyboardShortcuts() {
  const { undo, redo, canUndo, canRedo } = useMindmapStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        if (canRedo()) redo();
      }
      // Ctrl+S: no-op for now (auto-saved to localStorage)
      if (e.key === 's') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, canUndo, canRedo]);
}

interface ContextMenu {
  x: number;
  y: number;
  nodeId: string;
  nodeType: string;
}

interface MenuItem {
  label: string;
  icon: string;
  color: string;
  onClick: () => void;
}

interface SeparatorItem {
  type: 'separator';
  label: string;
}

type MenuEntry = MenuItem | SeparatorItem;

export function MindmapEditor() {
  useKeyboardShortcuts();

  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, deleteNode, duplicateNode, setSelectedNode } =
    useMindmapStore();

  // Compute hidden node IDs based on collapsed state (recursive)
  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    function hideChildren(nodeId: string) {
      edges.forEach((e) => {
        if (e.source === nodeId && !hidden.has(e.target)) {
          hidden.add(e.target);
          hideChildren(e.target);
        }
      });
    }
    nodes.forEach((node) => {
      const d = node.data as unknown as Record<string, unknown>;
      if (d.collapsed && !hidden.has(node.id)) hideChildren(node.id);
    });
    return hidden;
  }, [nodes, edges]);

  const displayNodes = useMemo(
    () => nodes.map((n) => hiddenNodeIds.has(n.id) ? { ...n, hidden: true } : n),
    [nodes, hiddenNodeIds],
  );

  // Style edges connected to/from branch nodes
  const styledEdges = useMemo(() => {
    const branchIds = new Set(nodes.filter((n) => n.type === 'branch').map((n) => n.id));
    return edges.map((e) => {
      // Incoming edge: activity/resource → branch node (amber dashed, animated)
      if (branchIds.has(e.target)) {
        return {
          ...e,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '6,3' },
          label: '🔀',
          labelStyle: { fontSize: 12 },
          labelBgStyle: { fill: '#fef3c7', fillOpacity: 0.9, borderRadius: 4 },
          labelBgPadding: [4, 4] as [number, number],
        };
      }
      // Outgoing true branch: green (label already on BranchNode handle)
      if (branchIds.has(e.source) && e.sourceHandle === 'source-true') {
        return { ...e, type: 'smoothstep', style: { stroke: '#10b981', strokeWidth: 2 } };
      }
      // Outgoing false branch: red (label already on BranchNode handle)
      if (branchIds.has(e.source) && e.sourceHandle === 'source-false') {
        return { ...e, type: 'smoothstep', style: { stroke: '#f87171', strokeWidth: 2 } };
      }
      return e;
    });
  }, [edges, nodes]);

  // Virtual edges for manually-added restriction dependencies (dashed amber, read-only)
  // Branch-derived restrictions are already expressed by the colored OUI/NON structural edges.
  const restrictionEdges = useMemo(() => {
    const result: Edge[] = [];

    // IDs of nodes that are direct children of a branch node — their restriction
    // is already shown by the colored OUI/NON structural edges, skip them here.
    const branchChildIds = new Set(
      edges
        .filter((e) => nodes.find((n) => n.id === e.source)?.type === 'branch')
        .map((e) => e.target),
    );

    for (const node of nodes) {
      if (branchChildIds.has(node.id)) continue;
      const d = node.data as unknown as Record<string, unknown>;
      const restrictions = Array.isArray(d.restrictions) ? d.restrictions as Array<Record<string, unknown>> : [];
      restrictions.forEach((r, i) => {
        if ((r.type === 'completion' || r.type === 'grade') && r.nodeId) {
          result.push({
            id: `restriction-${node.id}-${i}`,
            source: String(r.nodeId),
            target: node.id,
            type: 'smoothstep',
            style: { stroke: '#f59e0b', strokeDasharray: '6,3', strokeWidth: 1.5, opacity: 0.75 },
            label: r.type === 'completion' ? '✅' : '⭐',
            labelStyle: { fontSize: 10, fill: '#f59e0b', fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
            deletable: false,
          });
        }
      });
    }

    return result;
  }, [nodes, edges]);
  const reactFlowRef = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: MindmapNode) => {
      setSelectedNode(node.id);
      setContextMenu(null);
    },
    [setSelectedNode],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setContextMenu(null);
  }, [setSelectedNode]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: MindmapNode) => {
    event.preventDefault();
    const bounds = reactFlowRef.current?.getBoundingClientRect();
    if (!bounds) return;

    setContextMenu({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      nodeId: node.id,
      nodeType: node.type || '',
    });
  }, []);

  const addChildNode = useCallback(
    (parentId: string, type: string, data: MindmapNode['data'], sourceHandle?: string) => {
      if (!rfInstance) return;

      const parentNode = nodes.find((n) => n.id === parentId);
      if (!parentNode) return;

      let nodeData = data;

      // Inject access restriction when adding a child to a branch node
      if (parentNode.type === 'branch' && (sourceHandle === 'source-true' || sourceHandle === 'source-false')) {
        // The reference node is the parent of the branch node (the activity/resource it's attached to)
        const refEdge = edges.find((e) => e.target === parentId);
        const refNodeId = refEdge?.source;

        if (refNodeId) {
          const restriction: Restriction = {
            type: 'completion',
            nodeId: refNodeId,
            expected: sourceHandle === 'source-true' ? 1 : 0,
          };
          const existing = data as unknown as Record<string, unknown>;
          nodeData = {
            ...data,
            restrictions: [...((existing.restrictions ?? []) as Restriction[]), restriction],
          } as MindmapNode['data'];
        }
      }

      const childCount = edges.filter((e) => e.source === parentId && (!sourceHandle || e.sourceHandle === sourceHandle)).length;
      const xOffset = sourceHandle === 'source-true' ? 260 : (childCount - 1) * 220;
      const yOffset = sourceHandle === 'source-false' ? 160 : 200;

      addNode(
        {
          id: generateNodeId(),
          type,
          position: { x: parentNode.position.x + xOffset, y: parentNode.position.y + yOffset },
          data: nodeData,
        },
        parentId,
        sourceHandle,
      );
      setContextMenu(null);
    },
    [rfInstance, nodes, edges, addNode],
  );

  const getMenuItems = (nodeType: string, nodeId: string): MenuEntry[] => {
    if (nodeType === 'course') {
      return [
        {
          label: 'Section',
          icon: '📂',
          color: 'text-emerald-600',
          onClick: () => addChildNode(nodeId, 'section', { name: 'Nouvelle section', visible: true }),
        },
      ];
    }

    if (nodeType === 'section') {
      return [
        {
          label: 'Dupliquer',
          icon: '📋',
          color: 'text-slate-600',
          onClick: () => { duplicateNode(nodeId); setContextMenu(null); },
        },
        { type: 'separator', label: 'Ressources' },
        {
          label: 'Fichier',
          icon: '📄',
          color: 'text-amber-600',
          onClick: () =>
            addChildNode(nodeId, 'resource', { subtype: 'file', name: 'Nouveau fichier', visible: true }),
        },
        {
          label: 'URL',
          icon: '🔗',
          color: 'text-amber-600',
          onClick: () =>
            addChildNode(nodeId, 'resource', { subtype: 'url', name: 'Nouvelle URL', url: '', visible: true }),
        },
        {
          label: 'Page',
          icon: '📝',
          color: 'text-amber-600',
          onClick: () =>
            addChildNode(nodeId, 'resource', { subtype: 'page', name: 'Nouvelle page', content: '', visible: true }),
        },
        {
          label: 'Livre',
          icon: '📚',
          color: 'text-amber-600',
          onClick: () =>
            addChildNode(nodeId, 'resource', { subtype: 'book', name: 'Nouveau livre', numbering: 1, visible: true }),
        },
        { type: 'separator', label: 'Activités' },
        {
          label: 'Devoir',
          icon: '📋',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', {
              subtype: 'assign',
              name: 'Nouveau devoir',
              maxgrade: 100,
              submissiontype: 'file',
              visible: true,
            }),
        },
        {
          label: 'Quiz',
          icon: '❓',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', { subtype: 'quiz', name: 'Nouveau quiz', visible: true }),
        },
        {
          label: 'Forum',
          icon: '💬',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', { subtype: 'forum', name: 'Nouveau forum', type: 'general', visible: true }),
        },
        {
          label: 'H5P',
          icon: '🎮',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', { subtype: 'h5p', name: 'Nouvelle activité H5P', enabletracking: true, grademethod: 1, visible: true }),
        },
        {
          label: 'Glossaire',
          icon: '📖',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', { subtype: 'glossary', name: 'Nouveau glossaire', displayformat: 'dictionary', visible: true }),
        },
        {
          label: 'SCORM',
          icon: '🎯',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', { subtype: 'scorm', name: 'Nouveau SCORM', maxattempt: 0, grademethod: 1, visible: true }),
        },
        {
          label: 'Leçon',
          icon: '📘',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', { subtype: 'lesson', name: 'Nouvelle leçon', maxattempts: 0, visible: true }),
        },
        {
          label: 'Choix',
          icon: '📊',
          color: 'text-violet-600',
          onClick: () =>
            addChildNode(nodeId, 'activity', { subtype: 'choice', name: 'Nouveau choix', allowupdate: true, showresults: 1, visible: true }),
        },
        { type: 'separator', label: '' },
        {
          label: 'Supprimer la section',
          icon: '🗑️',
          color: 'text-red-500',
          onClick: () => { deleteNode(nodeId); setSelectedNode(null); setContextMenu(null); },
        },
      ];
    }

    if (nodeType === 'branch') {
      const trueChild = edges.some((e) => e.source === nodeId && e.sourceHandle === 'source-true');
      const falseChild = edges.some((e) => e.source === nodeId && e.sourceHandle === 'source-false');

      const branchItems = (handle: 'source-true' | 'source-false', filled: boolean, suffix: string): MenuEntry[] => {
        if (filled) {
          return [
            { type: 'separator', label: `${suffix} — déjà défini` },
          ];
        }
        return [
          { type: 'separator', label: `Ressources — ${suffix}` },
          { label: 'Fichier', icon: '📄', color: 'text-amber-600', onClick: () => addChildNode(nodeId, 'resource', { subtype: 'file', name: 'Fichier', visible: true }, handle) },
          { label: 'URL', icon: '🔗', color: 'text-amber-600', onClick: () => addChildNode(nodeId, 'resource', { subtype: 'url', name: 'URL', url: '', visible: true }, handle) },
          { label: 'Page', icon: '📝', color: 'text-amber-600', onClick: () => addChildNode(nodeId, 'resource', { subtype: 'page', name: 'Page', content: '', visible: true }, handle) },
          { label: 'Livre', icon: '📚', color: 'text-amber-600', onClick: () => addChildNode(nodeId, 'resource', { subtype: 'book', name: 'Livre', numbering: 1, visible: true }, handle) },
          { type: 'separator', label: `Activités — ${suffix}` },
          { label: 'Devoir', icon: '📋', color: 'text-violet-600', onClick: () => addChildNode(nodeId, 'activity', { subtype: 'assign', name: 'Devoir', maxgrade: 100, submissiontype: 'file', visible: true }, handle) },
          { label: 'Quiz', icon: '❓', color: 'text-violet-600', onClick: () => addChildNode(nodeId, 'activity', { subtype: 'quiz', name: 'Quiz', visible: true }, handle) },
          { label: 'Forum', icon: '💬', color: 'text-violet-600', onClick: () => addChildNode(nodeId, 'activity', { subtype: 'forum', name: 'Forum', type: 'general', visible: true }, handle) },
          { label: 'H5P', icon: '🎮', color: 'text-violet-600', onClick: () => addChildNode(nodeId, 'activity', { subtype: 'h5p', name: 'H5P', enabletracking: true, grademethod: 1, visible: true }, handle) },
          { label: 'Leçon', icon: '📘', color: 'text-violet-600', onClick: () => addChildNode(nodeId, 'activity', { subtype: 'lesson', name: 'Leçon', maxattempts: 0, visible: true }, handle) },
          { label: 'Feedback', icon: '📊', color: 'text-violet-600', onClick: () => addChildNode(nodeId, 'activity', { subtype: 'feedback', name: 'Feedback', visible: true }, handle) },
        ];
      };

      return [
        ...branchItems('source-true', trueChild, 'OUI ✓'),
        ...branchItems('source-false', falseChild, 'NON ✗'),
        { type: 'separator', label: '' },
        { label: 'Supprimer', icon: '🗑️', color: 'text-red-500', onClick: () => { deleteNode(nodeId); setSelectedNode(null); setContextMenu(null); } },
      ];
    }

    if (nodeType === 'resource' || nodeType === 'activity') {
      return [
        {
          label: 'Dupliquer',
          icon: '📋',
          color: 'text-slate-600',
          onClick: () => { duplicateNode(nodeId); setContextMenu(null); },
        },
        { type: 'separator', label: 'Parcours conditionnel' },
        {
          label: 'Ajouter condition',
          icon: '🔀',
          color: 'text-amber-600',
          onClick: () => addChildNode(nodeId, 'branch', { label: 'Condition', conditionType: 'completion' }),
        },
        { type: 'separator', label: '' },
        {
          label: 'Supprimer',
          icon: '🗑️',
          color: 'text-red-500',
          onClick: () => { deleteNode(nodeId); setSelectedNode(null); setContextMenu(null); },
        },
      ];
    }

    return [];
  };

  return (
    <div ref={reactFlowRef} className="relative w-full h-full bg-slate-100">
      <ReactFlow
        nodes={displayNodes}
        edges={[...styledEdges, ...restrictionEdges].map((e) =>
          hiddenNodeIds.has(e.target) || hiddenNodeIds.has(e.source) ? { ...e, hidden: true } : e
        )}
        onNodesChange={onNodesChange}
        onEdgesChange={(changes) => {
          // Ignore changes on virtual restriction edges
          onEdgesChange(changes.filter((c) => !('id' in c && String(c.id).startsWith('restriction-'))));
        }}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onInit={setRfInstance}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        defaultEdgeOptions={{
          style: { stroke: '#94a3b8', strokeWidth: 2 },
          animated: false,
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color="#cbd5e1"
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'course': return '#3B82F6';
              case 'section': return '#10B981';
              case 'resource': return '#F59E0B';
              case 'activity': return '#8B5CF6';
              case 'branch': return '#F59E0B';
              default: return '#94a3b8';
            }
          }}
          maskColor="rgba(241,245,249,0.85)"
          style={{ background: 'white' }}
        />
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && (() => {
        const items = getMenuItems(contextMenu.nodeType, contextMenu.nodeId);
        if (!items.length) return null;

        return (
          <div
            className="context-menu absolute z-50 bg-white rounded-xl shadow-2xl border border-slate-200/80 py-1.5 min-w-[180px] overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {items.map((item, i) =>
              'type' in item && item.type === 'separator' ? (
                <div key={i} className={`px-3 ${i > 0 ? 'pt-3 mt-1 border-t border-slate-100' : 'pt-1'} pb-0.5`}>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    {item.label}
                  </span>
                </div>
              ) : (
                <button
                  key={i}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700
                             hover:bg-slate-50 transition-colors duration-100 group"
                  onClick={'onClick' in item ? item.onClick : undefined}
                >
                  <span className="text-base leading-none w-5 text-center">{('icon' in item) ? item.icon : ''}</span>
                  <span className="font-medium">{('label' in item) ? item.label : ''}</span>
                </button>
              ),
            )}
          </div>
        );
      })()}
    </div>
  );
}
