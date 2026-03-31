import { describe, it, expect, beforeEach } from 'vitest';
import { useMindmapStore } from './mindmap-store';
import type { MindmapNode } from '@/types/mindmap.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, type: MindmapNode['type'], data: Record<string, unknown> = {}): MindmapNode {
  return { id, type, position: { x: 0, y: 0 }, data } as unknown as MindmapNode;
}

function getStore() {
  return useMindmapStore.getState();
}

beforeEach(() => {
  // Reset store to a clean state
  useMindmapStore.setState({
    nodes: [],
    edges: [],
    past: [],
    future: [],
  });
});

// ---------------------------------------------------------------------------
// addNode
// ---------------------------------------------------------------------------

describe('addNode', () => {
  it('adds the node to the store', () => {
    const node = makeNode('n1', 'activity', { name: 'Quiz', subtype: 'quiz' });
    getStore().addNode(node);
    expect(useMindmapStore.getState().nodes).toHaveLength(1);
    expect(useMindmapStore.getState().nodes[0].id).toBe('n1');
  });

  it('creates an edge when parentId is provided', () => {
    const parent = makeNode('p1', 'section');
    const child = makeNode('c1', 'activity', { name: 'Devoir', subtype: 'assign' });
    getStore().addNode(parent);
    getStore().addNode(child, 'p1');

    const edges = useMindmapStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('p1');
    expect(edges[0].target).toBe('c1');
  });

  it('stores sourceHandle on the edge when provided', () => {
    const branch = makeNode('b1', 'branch');
    const child = makeNode('c1', 'resource', { subtype: 'page' });
    getStore().addNode(branch);
    getStore().addNode(child, 'b1', 'source-true');

    const edges = useMindmapStore.getState().edges;
    const e = edges.find((e) => e.target === 'c1');
    expect(e?.sourceHandle).toBe('source-true');
  });

  it('does NOT create an edge when no parentId', () => {
    getStore().addNode(makeNode('n1', 'course'));
    expect(useMindmapStore.getState().edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateNode
// ---------------------------------------------------------------------------

describe('updateNode', () => {
  it('merges data into the node', () => {
    getStore().addNode(makeNode('n1', 'activity', { name: 'Old', completion: 0 }));
    getStore().updateNode('n1', { name: 'New', completion: 2 } as never);
    const node = useMindmapStore.getState().nodes.find((n) => n.id === 'n1');
    const d = node?.data as unknown as Record<string, unknown>;
    expect(d.name).toBe('New');
    expect(d.completion).toBe(2);
  });

  it('does not affect other nodes', () => {
    getStore().addNode(makeNode('n1', 'activity', { name: 'A' }));
    getStore().addNode(makeNode('n2', 'activity', { name: 'B' }));
    getStore().updateNode('n1', { name: 'Updated' } as never);
    const n2 = useMindmapStore.getState().nodes.find((n) => n.id === 'n2');
    expect((n2?.data as unknown as Record<string, unknown>).name).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// deleteNode
// ---------------------------------------------------------------------------

describe('deleteNode', () => {
  it('removes the node and its outgoing edges', () => {
    getStore().addNode(makeNode('p1', 'section'));
    getStore().addNode(makeNode('c1', 'activity'), 'p1');
    getStore().deleteNode('c1');
    expect(useMindmapStore.getState().nodes.find((n) => n.id === 'c1')).toBeUndefined();
    expect(useMindmapStore.getState().edges).toHaveLength(0);
  });

  it('recursively removes descendants', () => {
    getStore().addNode(makeNode('p1', 'activity'));
    getStore().addNode(makeNode('b1', 'branch'), 'p1');
    getStore().addNode(makeNode('c1', 'resource'), 'b1', 'source-true');
    getStore().deleteNode('b1');

    const ids = useMindmapStore.getState().nodes.map((n) => n.id);
    expect(ids).not.toContain('b1');
    expect(ids).not.toContain('c1');
    expect(useMindmapStore.getState().edges).toHaveLength(0);
  });

  it('does not delete the course-root node', () => {
    getStore().addNode(makeNode('course-root', 'course'));
    getStore().deleteNode('course-root');
    expect(useMindmapStore.getState().nodes.find((n) => n.id === 'course-root')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Branch restriction topology helpers (pure logic mirroring addChildNode)
// ---------------------------------------------------------------------------

describe('branch restriction topology', () => {
  it('edge from reference activity to branch can be found by target', () => {
    // Simulates: activity → branch (addChildNode creates this edge)
    getStore().addNode(makeNode('quiz-1', 'activity', { name: 'Quiz', subtype: 'quiz' }));
    getStore().addNode(makeNode('branch-1', 'branch'), 'quiz-1');

    const { edges } = useMindmapStore.getState();
    const refEdge = edges.find((e) => e.target === 'branch-1');
    expect(refEdge).toBeDefined();
    expect(refEdge?.source).toBe('quiz-1');
  });

  it('source-true and source-false edges are distinguishable', () => {
    getStore().addNode(makeNode('quiz-1', 'activity'));
    getStore().addNode(makeNode('branch-1', 'branch'), 'quiz-1');
    getStore().addNode(makeNode('true-child', 'resource', { subtype: 'page' }), 'branch-1', 'source-true');
    getStore().addNode(makeNode('false-child', 'activity', { subtype: 'assign' }), 'branch-1', 'source-false');

    const { edges } = useMindmapStore.getState();
    const trueEdge = edges.find((e) => e.source === 'branch-1' && e.sourceHandle === 'source-true');
    const falseEdge = edges.find((e) => e.source === 'branch-1' && e.sourceHandle === 'source-false');
    expect(trueEdge?.target).toBe('true-child');
    expect(falseEdge?.target).toBe('false-child');
  });

  it('undo restores previous state', () => {
    getStore().addNode(makeNode('n1', 'activity'));
    getStore().addNode(makeNode('n2', 'section'));
    getStore().undo();
    expect(useMindmapStore.getState().nodes.find((n) => n.id === 'n2')).toBeUndefined();
  });
});
