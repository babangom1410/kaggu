import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Connection,
  type EdgeChange,
  type NodeChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from 'reactflow';
import type { MindmapNode, MindmapEdge, MindmapNodeData, MoodleConfig } from '@/types/mindmap.types';

const HISTORY_LIMIT = 50;

interface HistorySnapshot {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
}

export type SaveStatus = 'saved' | 'saving';
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface MindmapState {
  // Persistent state
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  projectName: string;
  moodleConfig: MoodleConfig | null;

  // Session-only state
  projectId: string | null;
  selectedNodeId: string | null;
  moodlePanelOpen: boolean;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  saveStatus: SaveStatus;
  syncStatus: SyncStatus;

  // ReactFlow event handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Node actions
  addNode: (node: MindmapNode, parentId?: string, sourceHandle?: string) => void;
  updateNode: (id: string, data: Partial<MindmapNodeData>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  setSelectedNode: (id: string | null) => void;

  // Edge actions
  deleteEdge: (id: string) => void;

  // Project
  setProjectName: (name: string) => void;
  loadProject: (id: string, name: string, nodes: MindmapNode[], edges: MindmapEdge[], moodleConfig?: MoodleConfig | null) => void;
  setSyncStatus: (status: SyncStatus) => void;

  // Moodle
  setMoodleConfig: (config: MoodleConfig | null) => void;
  setMoodlePanelOpen: (open: boolean) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let nodeIdCounter = 1;
export function generateNodeId(): string {
  return `node-${Date.now()}-${nodeIdCounter++}`;
}

function generateEdgeId(source: string, target: string): string {
  return `edge-${source}-${target}`;
}

const DEFAULT_COURSE_NODE: MindmapNode = {
  id: 'course-root',
  type: 'course',
  position: { x: 400, y: 80 },
  data: {
    fullname: 'Nouveau cours',
    shortname: 'NOUVEAU',
    format: 'topics' as const,
    visible: true,
    category: 1,
  },
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useMindmapStore = create<MindmapState>()(
  persist(
    (set, get) => {
      // Push current nodes/edges to history before a structural mutation
      const pushHistory = () => {
        const { nodes, edges, past } = get();
        const snapshot: HistorySnapshot = {
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
        };
        set({
          past: [...past.slice(-HISTORY_LIMIT + 1), snapshot],
          future: [],
        });
      };

      // Mark as saving, then saved after debounce
      const markDirty = () => {
        if (saveTimer) clearTimeout(saveTimer);
        set({ saveStatus: 'saving' });
        saveTimer = setTimeout(() => set({ saveStatus: 'saved' }), 800);
      };

      return {
        nodes: [DEFAULT_COURSE_NODE],
        edges: [],
        projectName: 'Nouveau projet',
        moodleConfig: null,
        projectId: null,
        selectedNodeId: null,
        moodlePanelOpen: false,
        past: [],
        future: [],
        saveStatus: 'saved',
        syncStatus: 'idle',

        onNodesChange: (changes) => {
          set({ nodes: applyNodeChanges(changes, get().nodes) });
          // Only mark dirty on removals (drag positions are auto-persisted)
          if (changes.some((c) => c.type === 'remove')) markDirty();
        },

        onEdgesChange: (changes) => {
          set({ edges: applyEdgeChanges(changes, get().edges) });
          if (changes.some((c) => c.type === 'remove')) markDirty();
        },

        onConnect: (connection) => {
          pushHistory();
          set({ edges: addEdge(connection, get().edges) });
          markDirty();
        },

        addNode: (node, parentId, sourceHandle) => {
          pushHistory();
          const newNodes = [...get().nodes, node];
          let newEdges = get().edges;
          if (parentId) {
            const edge: MindmapEdge = {
              id: generateEdgeId(parentId, node.id),
              source: parentId,
              target: node.id,
              ...(sourceHandle ? { sourceHandle } : {}),
            };
            newEdges = [...newEdges, edge];
          }
          set({ nodes: newNodes, edges: newEdges });
          markDirty();
        },

        updateNode: (id, data) => {
          pushHistory();
          set({
            nodes: get().nodes.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
            ),
          });
          markDirty();
        },

        deleteNode: (id) => {
          if (id === 'course-root') return;
          pushHistory();

          const nodesToDelete = new Set<string>();
          const collectDescendants = (nodeId: string) => {
            if (nodesToDelete.has(nodeId)) return;
            nodesToDelete.add(nodeId);
            get()
              .edges.filter((e) => e.source === nodeId)
              .forEach((e) => collectDescendants(e.target));
          };
          collectDescendants(id);

          set({
            nodes: get().nodes.filter((n) => !nodesToDelete.has(n.id)),
            edges: get().edges.filter(
              (e) => !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target),
            ),
            selectedNodeId:
              get().selectedNodeId && nodesToDelete.has(get().selectedNodeId!) ?
                null
              : get().selectedNodeId,
          });
          markDirty();
        },

        duplicateNode: (id) => {
          const { nodes, edges } = get();
          const source = nodes.find((n) => n.id === id);
          if (!source || source.type === 'course') return;
          pushHistory();

          const newId = generateNodeId();
          const duplicate: MindmapNode = {
            ...source,
            id: newId,
            position: { x: source.position.x + 40, y: source.position.y + 40 },
            data: JSON.parse(JSON.stringify(source.data)),
          };

          // Find parent and connect duplicate to same parent
          const parentEdge = edges.find((e) => e.target === id);
          const newEdges = parentEdge
            ? [...edges, { id: generateEdgeId(parentEdge.source, newId), source: parentEdge.source, target: newId }]
            : edges;

          set({ nodes: [...nodes, duplicate], edges: newEdges });
          markDirty();
        },

        setSelectedNode: (id) => set({ selectedNodeId: id }),

        deleteEdge: (id) => {
          pushHistory();
          set({ edges: get().edges.filter((e) => e.id !== id) });
          markDirty();
        },

        setProjectName: (name) => {
          set({ projectName: name });
          markDirty();
        },

        loadProject: (id, name, nodes, edges, moodleConfig) => {
          set({ projectId: id, projectName: name, nodes, edges, moodleConfig: moodleConfig ?? null, past: [], future: [], syncStatus: 'synced' });
        },

        setSyncStatus: (status) => set({ syncStatus: status }),

        setMoodleConfig: (config) => {
          set({ moodleConfig: config });
          markDirty();
        },

        setMoodlePanelOpen: (open) => set({ moodlePanelOpen: open }),

        undo: () => {
          const { past, nodes, edges, future } = get();
          if (!past.length) return;

          const previous = past[past.length - 1];
          const current: HistorySnapshot = {
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges)),
          };

          set({
            nodes: previous.nodes,
            edges: previous.edges,
            past: past.slice(0, -1),
            future: [current, ...future.slice(0, HISTORY_LIMIT - 1)],
          });
          markDirty();
        },

        redo: () => {
          const { future, nodes, edges, past } = get();
          if (!future.length) return;

          const next = future[0];
          const current: HistorySnapshot = {
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges)),
          };

          set({
            nodes: next.nodes,
            edges: next.edges,
            past: [...past.slice(-HISTORY_LIMIT + 1), current],
            future: future.slice(1),
          });
          markDirty();
        },

        canUndo: () => get().past.length > 0,
        canRedo: () => get().future.length > 0,
      };
    },
    {
      name: 'kaggu-mindmap',
      // Only persist the diagram data, not session state or history
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        projectName: state.projectName,
        projectId: state.projectId,
        moodleConfig: state.moodleConfig,
      }),
    },
  ),
);
