import { describe, it, expect, vi } from 'vitest';

// Mock Supabase so the module can be imported without env vars
vi.mock('../lib/supabase', () => ({ supabase: {} }));
// Mock moodle.service to avoid any real HTTP imports
vi.mock('./moodle.service', () => ({}));

import {
  buildAvailabilityJson,
  collectSectionModules,
  deriveModuleRestrictions,
  type BackendNode,
  type BackendEdgeWithHandle,
  type Restriction,
} from './export.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(
  id: string,
  type: BackendNode['type'],
  data: Record<string, unknown> = {},
): BackendNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function edge(
  source: string,
  target: string,
  sourceHandle?: string,
): BackendEdgeWithHandle {
  return { id: `${source}-${target}`, source, target, sourceHandle };
}

function mappings(
  entries: Array<{ id: string; moodle_id: number; moodle_type: string }>,
): Map<string, { moodle_id: number; moodle_type: string }> {
  const m = new Map<string, { moodle_id: number; moodle_type: string }>();
  for (const e of entries) m.set(e.id, { moodle_id: e.moodle_id, moodle_type: e.moodle_type });
  return m;
}

// ---------------------------------------------------------------------------
// buildAvailabilityJson
// ---------------------------------------------------------------------------

describe('buildAvailabilityJson', () => {
  it('returns null for empty restrictions', () => {
    const result = buildAvailabilityJson([], new Map(), []);
    expect(result.json).toBeNull();
    expect(result.skippedNoCompletion).toEqual([]);
  });

  it('builds a completion restriction', () => {
    const nodes = [node('quiz-1', 'activity', { name: 'Quiz 1', completion: 1 })];
    const m = mappings([{ id: 'quiz-1', moodle_id: 42, moodle_type: 'module' }]);
    const restrictions: Restriction[] = [{ type: 'completion', nodeId: 'quiz-1', expected: 1 }];

    const { json, skippedNoCompletion } = buildAvailabilityJson(restrictions, m, nodes);
    expect(skippedNoCompletion).toEqual([]);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.op).toBe('&');
    expect(parsed.c).toHaveLength(1);
    expect(parsed.c[0]).toMatchObject({ type: 'completion', cm: 42, e: 1 });
  });

  it('returns e=0 for expected=0 (NON branch)', () => {
    const nodes = [node('quiz-1', 'activity', { name: 'Quiz 1', completion: 1 })];
    const m = mappings([{ id: 'quiz-1', moodle_id: 42, moodle_type: 'module' }]);
    const restrictions: Restriction[] = [{ type: 'completion', nodeId: 'quiz-1', expected: 0 }];

    const { json } = buildAvailabilityJson(restrictions, m, nodes);
    const parsed = JSON.parse(json!);
    expect(parsed.c[0].e).toBe(0);
  });

  it('skips completion restriction when reference has completion=0', () => {
    const nodes = [node('quiz-1', 'activity', { name: 'Quiz sans achèvement', completion: 0 })];
    const m = mappings([{ id: 'quiz-1', moodle_id: 42, moodle_type: 'module' }]);
    const restrictions: Restriction[] = [{ type: 'completion', nodeId: 'quiz-1', expected: 1 }];

    const { json, skippedNoCompletion } = buildAvailabilityJson(restrictions, m, nodes);
    expect(json).toBeNull();
    expect(skippedNoCompletion).toContain('Quiz sans achèvement');
  });

  it('builds a date restriction', () => {
    const restrictions: Restriction[] = [{ type: 'date', direction: '>=', date: '2025-01-01' }];
    const { json } = buildAvailabilityJson(restrictions, new Map(), []);
    const parsed = JSON.parse(json!);
    expect(parsed.c[0].type).toBe('date');
    expect(parsed.c[0].d).toBe('>=');
    expect(typeof parsed.c[0].t).toBe('number');
  });

  it('uses | operator when requested', () => {
    const nodes = [
      node('q1', 'activity', { name: 'Q1', completion: 1 }),
      node('q2', 'activity', { name: 'Q2', completion: 1 }),
    ];
    const m = mappings([
      { id: 'q1', moodle_id: 10, moodle_type: 'module' },
      { id: 'q2', moodle_id: 11, moodle_type: 'module' },
    ]);
    const restrictions: Restriction[] = [
      { type: 'completion', nodeId: 'q1', expected: 1 },
      { type: 'completion', nodeId: 'q2', expected: 1 },
    ];
    const { json } = buildAvailabilityJson(restrictions, m, nodes, '|');
    expect(JSON.parse(json!).op).toBe('|');
  });

  it('skips grade restriction if node has no mapping', () => {
    const restrictions: Restriction[] = [{ type: 'grade', nodeId: 'unknown', min: 50 }];
    const { json } = buildAvailabilityJson(restrictions, new Map(), []);
    expect(json).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// collectSectionModules
// ---------------------------------------------------------------------------

describe('collectSectionModules', () => {
  it('returns direct activity/resource children of a section', () => {
    const section = node('sec-1', 'section');
    const activity = node('act-1', 'activity', { name: 'Quiz' });
    const resource = node('res-1', 'resource', { name: 'Page' });
    const nodes = [section, activity, resource];
    const edges = [edge('sec-1', 'act-1'), edge('sec-1', 'res-1')];

    const result = collectSectionModules('sec-1', edges, nodes);
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toContain('act-1');
    expect(result.map((n) => n.id)).toContain('res-1');
  });

  it('includes branch node children in the same section', () => {
    const section = node('sec-1', 'section');
    const activity = node('act-1', 'activity', { name: 'Quiz' });
    const branch = node('branch-1', 'branch');
    const trueChild = node('true-1', 'resource', { name: 'OUI resource' });
    const falseChild = node('false-1', 'activity', { name: 'NON activity' });
    const nodes = [section, activity, branch, trueChild, falseChild];
    const edges = [
      edge('sec-1', 'act-1'),
      edge('act-1', 'branch-1'),
      edge('branch-1', 'true-1', 'source-true'),
      edge('branch-1', 'false-1', 'source-false'),
    ];

    const result = collectSectionModules('sec-1', edges, nodes);
    expect(result.map((n) => n.id)).toEqual(['act-1', 'true-1', 'false-1']);
  });

  it('excludes branch nodes themselves', () => {
    const section = node('sec-1', 'section');
    const activity = node('act-1', 'activity', {});
    const branch = node('branch-1', 'branch');
    const nodes = [section, activity, branch];
    const edges = [edge('sec-1', 'act-1'), edge('act-1', 'branch-1')];

    const result = collectSectionModules('sec-1', edges, nodes);
    expect(result.map((n) => n.id)).toEqual(['act-1']);
  });

  it('returns empty for a section with no children', () => {
    const nodes = [node('sec-1', 'section')];
    const result = collectSectionModules('sec-1', [], nodes);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deriveModuleRestrictions
// ---------------------------------------------------------------------------

describe('deriveModuleRestrictions', () => {
  it('returns existing restrictions unchanged when parent is not a branch node', () => {
    const section = node('sec-1', 'section');
    const activity = node('act-1', 'activity', {
      restrictions: [{ type: 'date', direction: '>=', date: '2025-01-01' }],
    });
    const nodes = [section, activity];
    const edges = [edge('sec-1', 'act-1')];

    const { restrictions } = deriveModuleRestrictions(activity, edges, nodes);
    expect(restrictions).toHaveLength(1);
    expect(restrictions[0].type).toBe('date');
  });

  it('injects completion restriction (expected=1) for source-true child', () => {
    const refActivity = node('quiz-1', 'activity', { name: 'Quiz', completion: 1 });
    const branch = node('branch-1', 'branch');
    const trueChild = node('true-child', 'resource', { name: 'OUI page' });
    const nodes = [refActivity, branch, trueChild];
    const edges = [
      edge('quiz-1', 'branch-1'),
      edge('branch-1', 'true-child', 'source-true'),
    ];

    const { restrictions } = deriveModuleRestrictions(trueChild, edges, nodes);
    expect(restrictions).toHaveLength(1);
    expect(restrictions[0]).toMatchObject({ type: 'completion', nodeId: 'quiz-1', expected: 1 });
  });

  it('injects completion restriction (expected=0) for source-false child', () => {
    const refActivity = node('quiz-1', 'activity', { name: 'Quiz', completion: 1 });
    const branch = node('branch-1', 'branch');
    const falseChild = node('false-child', 'activity', { name: 'NON devoir' });
    const nodes = [refActivity, branch, falseChild];
    const edges = [
      edge('quiz-1', 'branch-1'),
      edge('branch-1', 'false-child', 'source-false'),
    ];

    const { restrictions } = deriveModuleRestrictions(falseChild, edges, nodes);
    expect(restrictions[0]).toMatchObject({ type: 'completion', nodeId: 'quiz-1', expected: 0 });
  });

  it('does not duplicate an existing branch restriction already in node.data', () => {
    const refActivity = node('quiz-1', 'activity', {});
    const branch = node('branch-1', 'branch');
    const trueChild = node('true-child', 'resource', {
      restrictions: [{ type: 'completion', nodeId: 'quiz-1', expected: 1 }],
    });
    const nodes = [refActivity, branch, trueChild];
    const edges = [
      edge('quiz-1', 'branch-1'),
      edge('branch-1', 'true-child', 'source-true'),
    ];

    const { restrictions } = deriveModuleRestrictions(trueChild, edges, nodes);
    expect(restrictions).toHaveLength(1);
  });

  it('prepends branch restriction before any existing restrictions', () => {
    const refActivity = node('quiz-1', 'activity', {});
    const branch = node('branch-1', 'branch');
    const trueChild = node('true-child', 'resource', {
      restrictions: [{ type: 'date', direction: '>=', date: '2025-06-01' }],
    });
    const nodes = [refActivity, branch, trueChild];
    const edges = [
      edge('quiz-1', 'branch-1'),
      edge('branch-1', 'true-child', 'source-true'),
    ];

    const { restrictions } = deriveModuleRestrictions(trueChild, edges, nodes);
    expect(restrictions).toHaveLength(2);
    expect(restrictions[0].type).toBe('completion');
    expect(restrictions[1].type).toBe('date');
  });

  it('returns empty restrictions when node has no parent edge', () => {
    const orphan = node('orphan', 'activity', {});
    const { restrictions } = deriveModuleRestrictions(orphan, [], [orphan]);
    expect(restrictions).toEqual([]);
  });
});
