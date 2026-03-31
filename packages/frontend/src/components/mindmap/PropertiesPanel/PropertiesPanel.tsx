import { useState } from 'react';
import { useMindmapStore } from '@/stores/mindmap-store';
import { AiAssistant } from '@/components/mindmap/AiAssistant';
import { PageEditorModal } from '@/components/mindmap/PageEditorModal';
import { QuizEditorModal } from '@/components/mindmap/QuizEditorModal';
import { LessonEditorModal } from '@/components/mindmap/LessonEditorModal';
import { FeedbackEditorModal } from '@/components/mindmap/FeedbackEditorModal';
import { BookEditorModal } from '@/components/mindmap/BookEditorModal';
import type { Restriction, MindmapNode, QuizQuestion } from '@/types/mindmap.types';

const UNSUPPORTED_CONTENT_SUBTYPES = new Set(['assign', 'h5p', 'glossary', 'scorm', 'choice', 'file']);

function UnsupportedContentBanner() {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
      <span className="text-slate-500 text-base leading-none mt-0.5">ℹ️</span>
      <p className="text-xs text-slate-500 leading-relaxed">
        Le contenu de ce module n'est pas encore pris en charge dans Kàggu.
        Les paramètres de base sont exportés vers Moodle.
      </p>
    </div>
  );
}

const TYPE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  course: { label: 'Cours', icon: '🎓', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  section: { label: 'Section', icon: '📂', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  resource: { label: 'Ressource', icon: '📄', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  activity: { label: 'Activité', icon: '📋', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  branch: { label: 'Conditionnel', icon: '🔀', color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50
                 focus:outline-none placeholder:text-slate-600 transition-colors"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full"
    >
      <span className="text-sm text-slate-300">{label}</span>
      <div
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
          checked ? 'bg-indigo-500' : 'bg-slate-700'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}

function EditorButton({
  value,
  placeholder,
  onClick,
  required,
}: {
  value: string;
  placeholder: string;
  onClick: () => void;
  required?: boolean;
}) {
  const preview = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700
                 bg-slate-800 hover:border-amber-500/50 transition-colors text-left group"
    >
      <span className="text-amber-400 text-sm flex-shrink-0">📝</span>
      <div className="flex-1 min-w-0">
        {preview ? (
          <span className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{preview.slice(0, 100)}{preview.length > 100 ? '…' : ''}</span>
        ) : (
          <span className={`text-xs ${required ? 'text-amber-600' : 'text-slate-600'}`}>{placeholder}</span>
        )}
      </div>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-slate-500 group-hover:text-amber-400 flex-shrink-0 transition-colors">
        <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ─── CompletionPanel ──────────────────────────────────────────────────────────

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400
                 uppercase tracking-wider hover:text-slate-200 transition-colors">
      {label}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
        className={`transition-transform ${open ? 'rotate-180' : ''}`}>
        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

interface CompletionPanelProps {
  showCompletion?: boolean;
  data: Record<string, unknown>;
  update: (key: string, value: unknown) => void;
  nodes: MindmapNode[];
  nodeId: string;
}

/** Returns true if adding a restriction from `depId` → `targetId` would create a cycle. */
function wouldCreateCycle(depId: string, targetId: string, nodes: MindmapNode[]): boolean {
  // Build adjacency: nodeId → set of nodeIds it depends on
  const deps = new Map<string, Set<string>>();
  for (const n of nodes) {
    const d = n.data as unknown as Record<string, unknown>;
    const restr = (d.restrictions ?? []) as Array<Record<string, unknown>>;
    const set = new Set<string>();
    for (const r of restr) {
      if ((r.type === 'completion' || r.type === 'grade') && r.nodeId) {
        set.add(String(r.nodeId));
      }
    }
    deps.set(n.id, set);
  }
  // Temporarily add the new edge: targetId depends on depId
  const existing = deps.get(targetId) ?? new Set<string>();
  existing.add(depId);
  deps.set(targetId, existing);

  // DFS from targetId — if we reach targetId again, it's a cycle
  const visited = new Set<string>();
  function dfs(id: string): boolean {
    if (id === targetId && visited.size > 0) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    for (const next of deps.get(id) ?? []) {
      if (dfs(next)) return true;
    }
    return false;
  }
  return dfs(depId);
}

function CompletionPanel({ data, update, nodes, nodeId, showCompletion = true }: CompletionPanelProps) {
  const [completionOpen, setCompletionOpen] = useState(false);
  const [restrictionsOpen, setRestrictionsOpen] = useState(false);

  const completion = Number(data.completion ?? 0) as 0 | 1 | 2;
  const restrictions = (data.restrictions ?? []) as Restriction[];

  const otherModules = nodes.filter((n: MindmapNode) =>
    n.id !== nodeId && (n.type === 'activity' || n.type === 'resource'),
  );

  const addRestriction = (type: Restriction['type']) => {
    const base = [...restrictions];
    if (type === 'date') {
      base.push({ type: 'date', direction: '>=', date: '' });
    } else if (type === 'grade') {
      const safeId = otherModules.find((m) => !wouldCreateCycle(m.id, nodeId, nodes))?.id ?? '';
      base.push({ type: 'grade', nodeId: safeId, min: 50 });
    } else {
      const safeId = otherModules.find((m) => !wouldCreateCycle(m.id, nodeId, nodes))?.id ?? '';
      base.push({ type: 'completion', nodeId: safeId, expected: 1 });
    }
    update('restrictions', base);
  };

  const updateRestriction = (i: number, patch: Partial<Restriction>) => {
    const base = [...restrictions];
    base[i] = { ...base[i], ...patch } as Restriction;
    update('restrictions', base);
  };

  const removeRestriction = (i: number) => {
    update('restrictions', restrictions.filter((_, idx) => idx !== i));
  };

  const nodeLabel = (id: string) => {
    const n = nodes.find((x: MindmapNode) => x.id === id);
    const d = n?.data as Record<string, unknown> | undefined;
    return String(d?.name ?? d?.fullname ?? id);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-slate-700/50">
      {/* Completion — hidden for section nodes */}
      {showCompletion && <div className="space-y-2">
        <SectionHeader label="Achèvement" open={completionOpen} onToggle={() => setCompletionOpen((v) => !v)} />
        {completionOpen && (
          <div className="space-y-2 pl-1">
            <select value={completion} onChange={(e) => update('completion', Number(e.target.value))}
              className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1.5
                         border border-slate-700 focus:border-indigo-500 focus:outline-none">
              <option value={0}>Aucun suivi</option>
              <option value={1}>Manuel (case à cocher)</option>
              <option value={2}>Automatique</option>
            </select>
            {completion === 2 && (
              <div className="space-y-1.5">
                <Toggle checked={Boolean(data.completionview)} onChange={(v) => update('completionview', v)}
                  label="Vue obligatoire" />
                <Toggle checked={Boolean(data.completionusegrade)} onChange={(v) => update('completionusegrade', v)}
                  label="Note requise" />
                {Boolean(data.completionusegrade) && (
                  <Toggle checked={Boolean(data.completionpassgrade)} onChange={(v) => update('completionpassgrade', v)}
                    label="Note de passage requise" />
                )}
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Date attendue</label>
                  <input type="date" value={String(data.completionexpected ?? '')}
                    onChange={(e) => update('completionexpected', e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1.5
                               border border-slate-700 focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>}

      {/* Restrictions */}
      <div className="space-y-2">
        <SectionHeader label={`Restrictions${restrictions.length ? ` (${restrictions.length})` : ''}`}
          open={restrictionsOpen} onToggle={() => setRestrictionsOpen((v) => !v)} />
        {restrictionsOpen && (
          <div className="space-y-2 pl-1">
            {restrictions.map((r, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-400">
                    {r.type === 'date' ? '📅 Date' : r.type === 'grade' ? '⭐ Note' : '✅ Achèvement'}
                  </span>
                  <button onClick={() => removeRestriction(i)}
                    className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
                </div>
                {r.type === 'date' && (
                  <div className="flex gap-1.5">
                    <select value={r.direction}
                      onChange={(e) => updateRestriction(i, { direction: e.target.value as '>=' | '<' })}
                      className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-1 border border-slate-600">
                      <option value=">=">À partir du</option>
                      <option value="<">Jusqu'au</option>
                    </select>
                    <input type="date" value={r.date}
                      onChange={(e) => updateRestriction(i, { date: e.target.value })}
                      className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-1 border border-slate-600" />
                  </div>
                )}
                {(r.type === 'grade' || r.type === 'completion') && (() => {
                  const cycleModules = new Set(
                    otherModules.filter((m) => wouldCreateCycle(m.id, nodeId, nodes)).map((m) => m.id),
                  );
                  const hasCycle = r.nodeId && cycleModules.has(r.nodeId);
                  return (
                    <>
                      <select value={r.nodeId}
                        onChange={(e) => updateRestriction(i, { nodeId: e.target.value })}
                        className={`w-full bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-1 border ${hasCycle ? 'border-red-500' : 'border-slate-600'}`}>
                        {otherModules.map((n: MindmapNode) => (
                          <option key={n.id} value={n.id} disabled={cycleModules.has(n.id)}>
                            {nodeLabel(n.id)}{cycleModules.has(n.id) ? ' ⚠ cycle' : ''}
                          </option>
                        ))}
                      </select>
                      {hasCycle && (
                        <p className="text-[10px] text-red-400">
                          ⚠ Dépendance circulaire détectée — cette restriction créerait un cycle.
                        </p>
                      )}
                    </>
                  );
                })()}
                {r.type === 'grade' && (
                  <div className="flex gap-1.5">
                    <input type="number" placeholder="Min %" value={r.min ?? ''}
                      onChange={(e) => updateRestriction(i, { min: Number(e.target.value) })}
                      className="w-1/2 bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-1 border border-slate-600" />
                    <input type="number" placeholder="Max %" value={r.max ?? ''}
                      onChange={(e) => updateRestriction(i, { max: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-1/2 bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-1 border border-slate-600" />
                  </div>
                )}
                {r.type === 'completion' && (
                  <select value={r.expected}
                    onChange={(e) => updateRestriction(i, { expected: Number(e.target.value) as 1 | 0 })}
                    className="w-full bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-1 border border-slate-600">
                    <option value={1}>Doit être complété</option>
                    <option value={0}>Ne doit pas être complété</option>
                  </select>
                )}
              </div>
            ))}
            {restrictions.length > 1 && (
              <div className="flex items-center justify-between py-1">
                <span className="text-[11px] text-slate-500">Combiner les conditions</span>
                <div className="flex rounded-lg overflow-hidden border border-slate-700">
                  {(['&', '|'] as const).map((op) => (
                    <button key={op}
                      onClick={() => update('restrictionOperator', op)}
                      className={`px-2.5 py-1 text-xs font-semibold transition-colors
                        ${(data.restrictionOperator ?? '&') === op
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                      {op === '&' ? 'ET' : 'OU'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-1.5">
              {(['date', 'grade', 'completion'] as Restriction['type'][]).map((t) => (
                <button key={t} onClick={() => addRestriction(t)}
                  disabled={t !== 'date' && otherModules.length === 0}
                  className="flex-1 py-1 text-[11px] rounded-lg bg-slate-800 hover:bg-slate-700
                             text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors
                             disabled:opacity-30 disabled:cursor-not-allowed">
                  + {t === 'date' ? 'Date' : t === 'grade' ? 'Note' : 'Achèv.'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PropertiesPanelProps {
  nodeId: string;
}


// ─── PropertiesPanel ──────────────────────────────────────────────────────────

export function PropertiesPanel({ nodeId }: PropertiesPanelProps) {
  const { nodes, updateNode, deleteNode, setSelectedNode } = useMindmapStore();
  const [aiOpen, setAiOpen] = useState(false);
  const [pageEditorOpen, setPageEditorOpen] = useState<'description' | 'content' | null>(null);
  const [chapterEditorOpen, setChapterEditorOpen] = useState<number | null>(null);
  const [quizEditorOpen, setQuizEditorOpen] = useState(false);
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [bookEditorOpen, setBookEditorOpen] = useState(false);
  const [feedbackEditorOpen, setFeedbackEditorOpen] = useState(false);
  const node = nodes.find((n) => n.id === nodeId);

  if (!node) return null;

  const meta = TYPE_META[node.type ?? ''] ?? {
    label: node.type,
    icon: '◻',
    color: 'text-slate-400',
    bg: 'bg-slate-700',
  };

  const data = node.data as unknown as Record<string, unknown>;
  const isRoot = node.id === 'course-root';

  const update = (key: string, value: unknown) => {
    updateNode(nodeId, { [key]: value } as never);
  };

  const handleDelete = () => {
    deleteNode(nodeId);
    setSelectedNode(null);
  };

  if (aiOpen) {
    return (
      <div className="flex flex-col h-full text-slate-200">
        <AiAssistant node={node} onClose={() => setAiOpen(false)} />
      </div>
    );
  }

  return (
    <>
    {quizEditorOpen && data.subtype === 'quiz' && (
      <QuizEditorModal
        quizName={String(data.name ?? 'Quiz')}
        data={data}
        nodes={nodes}
        currentNodeId={nodeId}
        onUpdate={update}
        onClose={() => setQuizEditorOpen(false)}
      />
    )}
    {lessonEditorOpen && data.subtype === 'lesson' && (
      <LessonEditorModal
        lessonName={String(data.name ?? 'Leçon')}
        data={data}
        onUpdate={update}
        onClose={() => setLessonEditorOpen(false)}
      />
    )}
    {bookEditorOpen && data.subtype === 'book' && (
      <BookEditorModal
        bookName={String(data.name ?? 'Livre')}
        data={data}
        onUpdate={update}
        onClose={() => setBookEditorOpen(false)}
      />
    )}
    {feedbackEditorOpen && data.subtype === 'feedback' && (
      <FeedbackEditorModal
        feedbackName={String(data.name ?? 'Feedback')}
        data={data}
        onUpdate={update}
        onClose={() => setFeedbackEditorOpen(false)}
      />
    )}
    {pageEditorOpen === 'description' && (
      <PageEditorModal
        title={String(data.name ?? 'Page')}
        label="Description"
        content={String(data.description ?? '')}
        onSave={(html) => update('description', html)}
        onClose={() => setPageEditorOpen(null)}
      />
    )}
    {pageEditorOpen === 'content' && (
      <PageEditorModal
        title={String(data.name ?? 'Page')}
        label="Contenu de la page"
        content={String(data.content ?? '')}
        onSave={(html) => update('content', html)}
        onClose={() => setPageEditorOpen(null)}
      />
    )}
    {chapterEditorOpen !== null && (() => {
      const chapters = (data.chapters ?? []) as Array<{ id: string; title: string; content: string; subchapter: boolean }>;
      const ch = chapters[chapterEditorOpen];
      if (!ch) return null;
      return (
        <PageEditorModal
          title={ch.title || 'Chapitre'}
          label={ch.subchapter ? 'Sous-chapitre' : 'Chapitre'}
          content={ch.content ?? ''}
          onSave={(html) => {
            const updated = chapters.map((c, i) => i === chapterEditorOpen ? { ...c, content: html } : c);
            update('chapters', updated);
          }}
          onClose={() => setChapterEditorOpen(null)}
        />
      );
    })()}
    <div className="flex flex-col h-full text-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl ${meta.bg} flex items-center justify-center`}>
              <span className="text-base leading-none">{meta.icon}</span>
            </div>
            <div>
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${meta.color}`}>
                {meta.label}
              </div>
              <div className="text-xs text-slate-500">{nodeId}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
                         bg-indigo-500/15 text-indigo-400 border border-indigo-500/20
                         hover:bg-indigo-500/25 hover:text-indigo-300 transition-colors"
              title="Assistant IA"
            >
              ✨ IA
            </button>
            <button
              onClick={() => setSelectedNode(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500
                         hover:bg-slate-700 hover:text-slate-300 transition-colors"
              title="Fermer"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M1 1l10 10M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Course fields */}
        {node.type === 'course' && (
          <>
            <Field label="Nom complet">
              <TextInput
                value={String(data.fullname ?? '')}
                onChange={(v) => update('fullname', v)}
                placeholder="ex. Physique Quantique L3"
              />
            </Field>
            <Field label="Nom abrégé">
              <TextInput
                value={String(data.shortname ?? '')}
                onChange={(v) => update('shortname', v)}
                placeholder="ex. PQ-L3"
              />
            </Field>
            <Field label="Format">
              <select
                value={String(data.format ?? 'topics')}
                onChange={(e) => update('format', e.target.value)}
                className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                           border border-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value="topics">Par thèmes</option>
                <option value="weeks">Par semaines</option>
                <option value="social">Social</option>
              </select>
            </Field>
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}

        {/* Section fields */}
        {node.type === 'section' && (
          <>
            <Field label="Nom">
              <TextInput
                value={String(data.name ?? '')}
                onChange={(v) => update('name', v)}
                placeholder="ex. Introduction"
              />
            </Field>
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}

        {/* Branch node fields */}
        {node.type === 'branch' && (() => {
          const { edges: allEdges, nodes: allNodes } = useMindmapStore.getState();
          const parentEdge = allEdges.find((e) => e.target === nodeId);
          const parentNode = parentEdge ? nodes.find((n) => n.id === parentEdge.source) : null;
          const parentData = parentNode?.data as unknown as Record<string, unknown> | undefined;
          const parentName = parentData ? String(parentData.name ?? parentData.fullname ?? parentNode?.id) : null;

          const trueEdge = allEdges.find((e) => e.source === nodeId && e.sourceHandle === 'source-true');
          const falseEdge = allEdges.find((e) => e.source === nodeId && e.sourceHandle === 'source-false');
          const hasTrueChild = !!trueEdge;
          const hasFalseChild = !!falseEdge;
          const isOrphan = !hasTrueChild && !hasFalseChild;
          const isPartial = hasTrueChild !== hasFalseChild;

          const currentConditionType = String(data.conditionType ?? 'completion');
          const currentGradeMin = data.gradeMin as number | undefined;
          const refCompletion = Number(parentData?.completion ?? 0);
          const refNeedsCompletion = currentConditionType === 'completion' && refCompletion === 0;
          const refIsGradeable = parentNode?.type === 'activity' &&
            ['quiz', 'assign', 'h5p', 'scorm', 'lesson'].includes(String(parentData?.subtype ?? ''));
          const refNeedsGrade = currentConditionType === 'grade' && !refIsGradeable;

          // Propagate restriction changes to OUI/NON children
          const propagateToChildren = (condType: string, gradeMin?: number) => {
            const refNodeId = parentEdge?.source;
            if (!refNodeId) return;

            const applyToChild = (childId: string, isTrue: boolean) => {
              const childNode = allNodes.find((n) => n.id === childId);
              if (!childNode) return;
              const childData = childNode.data as unknown as Record<string, unknown>;
              const existing = (Array.isArray(childData.restrictions) ? childData.restrictions : []) as Restriction[];
              const filtered = existing.filter(
                (r) => !((r.type === 'completion' || r.type === 'grade') && r.nodeId === refNodeId),
              );
              const newRestriction: Restriction = condType === 'grade'
                ? (isTrue
                    ? { type: 'grade', nodeId: refNodeId, min: gradeMin }
                    : { type: 'grade', nodeId: refNodeId, max: gradeMin })
                : { type: 'completion', nodeId: refNodeId, expected: isTrue ? 1 : 0 };
              updateNode(childId, { restrictions: [newRestriction, ...filtered] } as never);
            };

            if (trueEdge) applyToChild(trueEdge.target, true);
            if (falseEdge) applyToChild(falseEdge.target, false);
          };

          return (
            <>
              {/* Orphan / partial warnings */}
              {isOrphan && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                  <span className="text-red-400 text-sm leading-none mt-0.5">⚠</span>
                  <p className="text-xs text-red-400 leading-relaxed">
                    Ce nœud n'a aucun enfant. Clic droit pour ajouter des ressources ou activités sur les branches OUI et NON.
                  </p>
                </div>
              )}
              {isPartial && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <span className="text-amber-400 text-sm leading-none mt-0.5">⚠</span>
                  <p className="text-xs text-amber-400 leading-relaxed">
                    La branche <span className="font-semibold">{hasTrueChild ? 'NON' : 'OUI'}</span> est vide.
                    Clic droit pour y ajouter un nœud.
                  </p>
                </div>
              )}

              {/* Reference activity */}
              {parentNode && (
                <div className={`rounded-xl border px-3 py-2.5 ${
                  refNeedsCompletion || refNeedsGrade
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-slate-800/60 border-transparent'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">
                      {parentNode.type === 'activity' ? '📋' : '📄'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Activité de référence
                      </div>
                      <div className="text-sm font-medium text-slate-200 truncate">{parentName}</div>
                    </div>
                    {refCompletion > 0 && (
                      <span className="text-xs text-teal-400 font-semibold shrink-0">✓ achèvement</span>
                    )}
                  </div>
                  {refNeedsCompletion && (
                    <p className="mt-2 text-xs text-amber-400 leading-relaxed">
                      ⚠ Activez l'achèvement sur ce nœud (panneau propriétés) pour que la condition fonctionne dans Moodle.
                    </p>
                  )}
                  {refNeedsGrade && (
                    <p className="mt-2 text-xs text-amber-400 leading-relaxed">
                      ⚠ Ce type de module n'est pas noté — la condition de note ne fonctionnera pas. Utilisez Quiz, Devoir, H5P, SCORM ou Leçon.
                    </p>
                  )}
                </div>
              )}

              <Field label="Libellé">
                <TextInput
                  value={String(data.label ?? '')}
                  onChange={(v) => update('label', v)}
                  placeholder="ex. Score > 50 % ?"
                />
              </Field>

              <Field label="Type de condition">
                <select
                  value={currentConditionType}
                  onChange={(e) => {
                    update('conditionType', e.target.value);
                    propagateToChildren(e.target.value, currentGradeMin);
                  }}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                             border border-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="completion">Activité complétée</option>
                  <option value="grade">Note minimale atteinte</option>
                </select>
              </Field>

              {currentConditionType === 'grade' && (
                <Field label="Note minimale (%)">
                  <TextInput
                    value={String(currentGradeMin ?? '')}
                    onChange={(v) => {
                      const n = v ? Number(v) : undefined;
                      update('gradeMin', n);
                      propagateToChildren('grade', n);
                    }}
                    placeholder="ex. 50"
                  />
                </Field>
              )}

              {/* Branch status indicators */}
              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-xl px-3 py-2 text-center text-xs font-semibold
                  ${hasTrueChild ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                  OUI → {hasTrueChild ? 'définie' : 'vide'}
                </div>
                <div className={`rounded-xl px-3 py-2 text-center text-xs font-semibold
                  ${hasFalseChild ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                  NON ↓ {hasFalseChild ? 'définie' : 'vide'}
                </div>
              </div>

              {/* Semantic info box */}
              <div className="bg-slate-800/60 rounded-xl p-3 space-y-1.5 text-xs text-slate-400">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5">🔀 Parcours conditionnel</p>
                {currentConditionType === 'completion' ? (
                  <>
                    <p>
                      <span className="text-emerald-400 font-semibold">OUI →</span> activité complétée.
                    </p>
                    <p>
                      <span className="text-red-400 font-semibold">NON ↓</span> activité non complétée.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <span className="text-emerald-400 font-semibold">OUI →</span>{' '}
                      note {currentGradeMin !== undefined ? `≥ ${currentGradeMin} %` : '≥ seuil défini'}.
                    </p>
                    <p>
                      <span className="text-red-400 font-semibold">NON ↓</span>{' '}
                      note {currentGradeMin !== undefined ? `< ${currentGradeMin} %` : '< seuil défini'}.
                    </p>
                  </>
                )}
              </div>

              <button
                onClick={handleDelete}
                className="w-full mt-2 py-2 rounded-xl text-xs font-semibold text-red-400 border border-red-500/20
                           hover:bg-red-500/10 transition-colors"
              >
                🗑 Supprimer ce nœud conditionnel
              </button>
            </>
          );
        })()}

        {/* Resource fields */}
        {node.type === 'resource' && (
          <>
            <Field label="Nom">
              <TextInput
                value={String(data.name ?? '')}
                onChange={(v) => update('name', v)}
                placeholder="Nom de la ressource"
              />
            </Field>
            {data.subtype === 'file' && (
              <Field label="Fichier">
                <div className="space-y-2">
                  <label className="flex items-center justify-center gap-2 w-full py-2 rounded-lg
                                    border border-dashed border-slate-600 hover:border-indigo-500
                                    text-xs text-slate-400 hover:text-slate-200 cursor-pointer
                                    bg-slate-800/50 transition-colors">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v8M3 5l3.5-4 3.5 4M1 10v1a1 1 0 001 1h9a1 1 0 001-1v-1"
                        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {data.filename ? 'Changer le fichier' : 'Choisir un fichier'}
                    <input type="file" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 20 * 1024 * 1024) {
                          alert('Fichier trop volumineux (max 20 Mo)');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(',')[1];
                          update('filename', file.name);
                          update('filedata', base64);
                          update('filesize', file.size);
                          update('filetype', file.type);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {data.filename as string && (
                    <div className="flex items-center justify-between px-2 py-1.5 bg-slate-800 rounded-lg">
                      <span className="text-xs text-slate-300 truncate max-w-[160px]">{String(data.filename)}</span>
                      <span className="text-xs text-slate-500 ml-2 shrink-0">
                        {data.filesize ? `${Math.round(Number(data.filesize) / 1024)} Ko` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </Field>
            )}
            {data.subtype === 'url' && (
              <Field label="URL">
                <TextInput
                  value={String(data.url ?? '')}
                  onChange={(v) => update('url', v)}
                  placeholder="https://..."
                />
              </Field>
            )}
            {data.subtype === 'page' && (
              <>
                <Field label="Description">
                  <EditorButton
                    value={String(data.description ?? '')}
                    placeholder="Résumé affiché sur la page de cours…"
                    onClick={() => setPageEditorOpen('description')}
                  />
                </Field>
                <Toggle
                  checked={Boolean(data.displaydescription)}
                  onChange={(v) => update('displaydescription', v)}
                  label="Afficher sur la page de cours"
                />
                <Field label="Contenu de la page">
                  <EditorButton
                    value={String(data.content ?? '')}
                    placeholder="Cliquez pour rédiger le contenu…"
                    onClick={() => setPageEditorOpen('content')}
                    required
                  />
                </Field>
                <div className="pt-1 border-t border-slate-700/40 space-y-1.5">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Apparence</div>
                  <Toggle
                    checked={Boolean(data.printintro ?? false)}
                    onChange={(v) => update('printintro', v)}
                    label="Afficher la description dans la page"
                  />
                  <Toggle
                    checked={Boolean(data.printlastmodified ?? true)}
                    onChange={(v) => update('printlastmodified', v)}
                    label="Afficher la date de modification"
                  />
                </div>
              </>
            )}
            {data.subtype === 'book' && (() => {
              const chapters = (data.chapters ?? []) as Array<{ id: string; title: string; content: string; subchapter: boolean }>;
              const genId = () => `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
              return (
                <>
                  <Field label="Description">
                    <EditorButton
                      value={String(data.description ?? '')}
                      placeholder="Description du livre…"
                      onClick={() => setPageEditorOpen('description')}
                    />
                  </Field>
                  <Field label="Numérotation des chapitres">
                    <select
                      value={String(data.numbering ?? 1)}
                      onChange={(e) => update('numbering', Number(e.target.value))}
                      className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                                 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value={0}>Aucune</option>
                      <option value={1}>Nombres (1, 2, 3…)</option>
                      <option value={2}>Puces</option>
                      <option value={3}>Indentation</option>
                    </select>
                  </Field>
                  <div className="border-t border-slate-700/40 pt-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Chapitres{chapters.length > 0 ? ` (${chapters.length})` : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => update('chapters', [...chapters, { id: genId(), title: 'Nouveau chapitre', content: '', subchapter: false }])}
                          className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                        >
                          + Ajouter
                        </button>
                        <button
                          onClick={() => setBookEditorOpen(true)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold
                                     bg-amber-500/15 text-amber-400 border border-amber-500/20
                                     hover:bg-amber-500/25 hover:text-amber-300 transition-colors"
                        >
                          📚 Éditeur IA
                        </button>
                      </div>
                    </div>
                    {chapters.length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-2">Aucun chapitre — cliquez sur + Ajouter</p>
                    )}
                    {chapters.map((ch, idx) => (
                      <div key={ch.id} className="flex items-center gap-1">
                        <div className="flex flex-col gap-px flex-shrink-0">
                          <button
                            onClick={() => { const a = [...chapters]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; update('chapters', a); }}
                            disabled={idx === 0}
                            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none"
                          >▲</button>
                          <button
                            onClick={() => { const a = [...chapters]; [a[idx+1], a[idx]] = [a[idx], a[idx+1]]; update('chapters', a); }}
                            disabled={idx === chapters.length - 1}
                            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none"
                          >▼</button>
                        </div>
                        <button
                          onClick={() => update('chapters', chapters.map((c, i) => i === idx ? { ...c, subchapter: !c.subchapter } : c))}
                          title={ch.subchapter ? 'Sous-chapitre' : 'Chapitre'}
                          className={`text-[10px] rounded px-1 py-0.5 flex-shrink-0 font-mono transition-colors ${ch.subchapter ? 'bg-slate-700 text-slate-500' : 'bg-slate-600 text-slate-200'}`}
                        >{ch.subchapter ? '↳' : '■'}</button>
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => update('chapters', chapters.map((c, i) => i === idx ? { ...c, title: e.target.value } : c))}
                          placeholder="Titre…"
                          className="flex-1 min-w-0 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600"
                        />
                        <button
                          onClick={() => setChapterEditorOpen(idx)}
                          title="Rédiger le contenu"
                          className={`text-sm flex-shrink-0 transition-colors ${ch.content ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'}`}
                        >📝</button>
                        <button
                          onClick={() => { update('chapters', chapters.filter((_, i) => i !== idx)); if (chapterEditorOpen === idx) setChapterEditorOpen(null); }}
                          className="text-slate-600 hover:text-red-400 text-xs flex-shrink-0 transition-colors font-bold"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}

        {/* Activity fields */}
        {node.type === 'activity' && (
          <>
            <Field label="Nom">
              <TextInput
                value={String(data.name ?? '')}
                onChange={(v) => update('name', v)}
                placeholder="Nom de l'activité"
              />
            </Field>
            {data.subtype === 'assign' && (
              <>
                <Field label="Note maximale">
                  <TextInput
                    value={String(data.maxgrade ?? 100)}
                    onChange={(v) => update('maxgrade', Number(v))}
                    placeholder="100"
                  />
                </Field>
                <Field label="Type de remise">
                  <select
                    value={String(data.submissiontype ?? 'file')}
                    onChange={(e) => update('submissiontype', e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                               border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="file">Fichier</option>
                    <option value="online_text">Texte en ligne</option>
                    <option value="both">Les deux</option>
                  </select>
                </Field>
                <UnsupportedContentBanner />
              </>
            )}
            {data.subtype === 'quiz' && (() => {
              const questions = (data.questions ?? []) as QuizQuestion[];
              const totalPts = questions.reduce((s, q) => s + (q.points ?? 1), 0);
              return (
                <>
                  {/* Compact summary */}
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-slate-300">
                        {questions.length > 0
                          ? `${questions.length} question${questions.length > 1 ? 's' : ''} · ${totalPts} pt${totalPts !== 1 ? 's' : ''}`
                          : 'Aucune question'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {data.attempts ? `${data.attempts} tentative${Number(data.attempts) > 1 ? 's' : ''}` : 'Illimité'}
                        {data.timelimit ? ` · ${Math.round(Number(data.timelimit) / 60)} min` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => setQuizEditorOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                 bg-violet-500/15 text-violet-400 border border-violet-500/20
                                 hover:bg-violet-500/25 hover:text-violet-300 transition-colors"
                    >
                      📝 Ouvrir l'éditeur
                    </button>
                  </div>
                </>
              );
            })()}
            {data.subtype === 'forum' && (
              <Field label="Type de forum">
                <select
                  value={String(data.type ?? 'general')}
                  onChange={(e) => update('type', e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                             border border-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="general">Général</option>
                  <option value="single">Discussion unique</option>
                  <option value="qanda">Questions/Réponses</option>
                  <option value="blog">Blog</option>
                  <option value="eachuser">Un sujet par participant</option>
                </select>
              </Field>
            )}
            {data.subtype === 'h5p' && (
              <>
                <Toggle
                  checked={Boolean(data.enabletracking ?? true)}
                  onChange={(v) => update('enabletracking', v)}
                  label="Suivi des tentatives"
                />
                <Field label="Méthode de notation">
                  <select
                    value={String(data.grademethod ?? 1)}
                    onChange={(e) => update('grademethod', Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                               border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value={1}>Note la plus haute</option>
                    <option value={2}>Note moyenne</option>
                    <option value={3}>Dernière tentative</option>
                  </select>
                </Field>
                <UnsupportedContentBanner />
              </>
            )}
            {data.subtype === 'glossary' && (
              <>
                <Field label="Format d'affichage">
                  <select
                    value={String(data.displayformat ?? 'dictionary')}
                    onChange={(e) => update('displayformat', e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                               border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="dictionary">Dictionnaire</option>
                    <option value="continuous">Continu</option>
                    <option value="compact">Compact</option>
                    <option value="fullwithoutauthor">Complet sans auteur</option>
                    <option value="fullwithauthor">Complet avec auteur</option>
                  </select>
                </Field>
                <Toggle
                  checked={Boolean(data.allowcomments)}
                  onChange={(v) => update('allowcomments', v)}
                  label="Autoriser les commentaires"
                />
                <UnsupportedContentBanner />
              </>
            )}
            {data.subtype === 'scorm' && (
              <>
                <Field label="Tentatives max (0 = illimité)">
                  <TextInput
                    value={String(data.maxattempt ?? 0)}
                    onChange={(v) => update('maxattempt', Number(v))}
                    placeholder="0"
                  />
                </Field>
                <Field label="Méthode de notation">
                  <select
                    value={String(data.grademethod ?? 1)}
                    onChange={(e) => update('grademethod', Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                               border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value={0}>Objets d'apprentissage</option>
                    <option value={1}>Tentative la plus haute</option>
                  </select>
                </Field>
                <UnsupportedContentBanner />
              </>
            )}
            {data.subtype === 'lesson' && (
              <>
                <Field label="Tentatives max (0 = illimité)">
                  <TextInput
                    value={String(data.maxattempts ?? 0)}
                    onChange={(v) => update('maxattempts', Number(v))}
                    placeholder="0"
                  />
                </Field>
                <Toggle
                  checked={Boolean(data.retake)}
                  onChange={(v) => update('retake', v)}
                  label="Autoriser les reprises"
                />
                <Toggle
                  checked={Boolean(data.review)}
                  onChange={(v) => update('review', v)}
                  label="Mode révision"
                />
                {(() => {
                  const pages = (data.pages ?? []) as Array<unknown>;
                  return (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700">
                      <div className="text-xs font-semibold text-slate-300">
                        {pages.length > 0 ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : 'Aucune page'}
                      </div>
                      <button
                        onClick={() => setLessonEditorOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                   bg-violet-500/15 text-violet-400 border border-violet-500/20
                                   hover:bg-violet-500/25 hover:text-violet-300 transition-colors"
                      >
                        📝 Ouvrir l'éditeur
                      </button>
                    </div>
                  );
                })()}
              </>
            )}
            {data.subtype === 'choice' && (
              <>
                <Field label="Affichage des résultats">
                  <select
                    value={String(data.showresults ?? 1)}
                    onChange={(e) => update('showresults', Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                               border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value={0}>Jamais</option>
                    <option value={1}>Après réponse</option>
                    <option value={2}>Après fermeture</option>
                    <option value={3}>Toujours</option>
                  </select>
                </Field>
                <Toggle
                  checked={Boolean(data.allowupdate ?? true)}
                  onChange={(v) => update('allowupdate', v)}
                  label="Autoriser la modification du choix"
                />
                <UnsupportedContentBanner />
              </>
            )}
            {data.subtype === 'feedback' && (
              <>
                <Toggle
                  checked={Number(data.anonymous ?? 1) === 1}
                  onChange={(v) => update('anonymous', v ? 1 : 0)}
                  label="Réponses anonymes"
                />
                <Toggle
                  checked={Boolean(data.multiple_submit)}
                  onChange={(v) => update('multiple_submit', v)}
                  label="Permettre plusieurs soumissions"
                />
                {(() => {
                  const items = (data.items ?? []) as Array<unknown>;
                  return (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700">
                      <div className="text-xs font-semibold text-slate-300">
                        {items.length > 0 ? `${items.length} question${items.length > 1 ? 's' : ''}` : 'Aucune question'}
                      </div>
                      <button
                        onClick={() => setFeedbackEditorOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                   bg-violet-500/15 text-violet-400 border border-violet-500/20
                                   hover:bg-violet-500/25 hover:text-violet-300 transition-colors"
                      >
                        📝 Ouvrir l'éditeur
                      </button>
                    </div>
                  );
                })()}
              </>
            )}
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}
        {/* Completion & Restrictions — resource and activity nodes */}
        {(node.type === 'resource' || node.type === 'activity') && (
          <CompletionPanel data={data} update={update} nodes={nodes} nodeId={nodeId} />
        )}
        {/* Restrictions d'accès — section nodes (no completion tracking) */}
        {node.type === 'section' && (
          <CompletionPanel data={data} update={update} nodes={nodes} nodeId={nodeId} showCompletion={false} />
        )}
      </div>

      {/* Footer — delete */}
      {!isRoot && (
        <div className="px-5 py-4 border-t border-slate-700/50">
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm
                       text-red-400 border border-red-500/20 bg-red-500/5
                       hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30
                       transition-all duration-150"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M1.5 3h10M4.5 3V2a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v4M7.5 6v4M2.5 3l.7 8a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Supprimer le nœud
          </button>
        </div>
      )}
    </div>
    </>
  );
}
