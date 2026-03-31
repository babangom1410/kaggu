import { useState, useRef, useEffect } from 'react';
import { scenarizeContent, type ContentTaskParams } from '@/api/llm-api';
import { useMindmapStore } from '@/stores/mindmap-store';
import type { PageResourceData, QuizActivityData, SectionNodeData } from '@/types/mindmap.types';

interface Props {
  onClose: () => void;
}

interface NodeTask {
  nodeId: string;
  subtype: 'page' | 'quiz';
  name: string;
  description: string;
  contentContext: string;
  questionCount?: number;
  status: 'pending' | 'done' | 'error';
}

const LANGUAGES = ['Français', 'English', 'Español', 'Deutsch', 'Arabe', 'Portugais'];

function buildTasks(
  nodes: ReturnType<typeof useMindmapStore.getState>['nodes'],
  edges: ReturnType<typeof useMindmapStore.getState>['edges'],
): NodeTask[] {
  // Build parent map: nodeId → parentId
  const parentMap = new Map<string, string>();
  for (const edge of edges) {
    parentMap.set(edge.target, edge.source);
  }

  const tasks: NodeTask[] = [];

  for (const node of nodes) {
    if (node.type === 'resource') {
      const d = node.data as PageResourceData;
      if (d.subtype === 'page' && !d.content?.trim()) {
        const sectionId = parentMap.get(node.id);
        const sectionNode = sectionId ? nodes.find((n) => n.id === sectionId) : undefined;
        const contentContext = sectionNode
          ? ((sectionNode.data as SectionNodeData).contentContext ?? '')
          : '';
        tasks.push({
          nodeId: node.id,
          subtype: 'page',
          name: d.name,
          description: d.description ?? '',
          contentContext,
          status: 'pending',
        });
      }
    } else if (node.type === 'activity') {
      const d = node.data as QuizActivityData;
      if (d.subtype === 'quiz' && (!d.questions || d.questions.length === 0)) {
        const sectionId = parentMap.get(node.id);
        const sectionNode = sectionId ? nodes.find((n) => n.id === sectionId) : undefined;
        const contentContext = sectionNode
          ? ((sectionNode.data as SectionNodeData).contentContext ?? '')
          : '';
        tasks.push({
          nodeId: node.id,
          subtype: 'quiz',
          name: d.name,
          description: d.description ?? '',
          contentContext,
          questionCount: 5,
          status: 'pending',
        });
      }
    }
  }

  return tasks;
}

export function ContentGenerationModal({ onClose }: Props) {
  const { nodes, edges, updateNode } = useMindmapStore();
  const [language, setLanguage] = useState('Français');
  const [tasks, setTasks] = useState<NodeTask[]>(() => buildTasks(nodes, edges));
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, generating]);

  // Refresh tasks when modal opens (in case user edited nodes before opening)
  useEffect(() => {
    setTasks(buildTasks(nodes, edges));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (tasks.length === 0) return;
    setError('');
    setDone(0);
    setGenerating(true);

    // Reset statuses
    setTasks((prev) => prev.map((t) => ({ ...t, status: 'pending' })));

    const controller = new AbortController();
    abortRef.current = controller;

    const apiTasks: ContentTaskParams[] = tasks.map((t) => ({
      nodeId:         t.nodeId,
      subtype:        t.subtype,
      name:           t.name,
      description:    t.description,
      contentContext: t.contentContext,
      questionCount:  t.questionCount,
    }));

    try {
      await scenarizeContent(apiTasks, language, (event, data) => {
        const d = data as Record<string, unknown>;

        if (event === 'node_done') {
          const nodeId = d.nodeId as string;
          const content = d.content as string | undefined;
          const questions = d.questions as unknown[] | undefined;

          // Apply to store immediately
          if (content !== undefined) {
            updateNode(nodeId, { content } as Partial<PageResourceData>);
          }
          if (questions !== undefined) {
            updateNode(nodeId, { questions } as Partial<QuizActivityData>);
          }

          // Mark task done
          setTasks((prev) =>
            prev.map((t) => (t.nodeId === nodeId ? { ...t, status: 'done' } : t)),
          );
          setDone((prev) => prev + 1);

        } else if (event === 'error') {
          setError((d.message as string) ?? 'Erreur inconnue');
        }
      }, controller.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setGenerating(false);
  };

  const allDone = done === tasks.length && tasks.length > 0;
  const progress = tasks.length > 0 ? (done / tasks.length) * 100 : 0;

  const SUBTYPE_LABELS: Record<string, string> = {
    page: '📄 Page',
    quiz: '❓ Quiz',
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>📝</span> Génération des contenus
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {tasks.length === 0
                ? 'Aucun nœud à remplir'
                : `${tasks.length} nœud${tasks.length > 1 ? 's' : ''} à générer`}
            </p>
          </div>
          <button
            onClick={generating ? handleCancel : onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {tasks.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <div className="text-3xl">✅</div>
              <div className="text-sm text-slate-400">
                Tous les nœuds page et quiz ont déjà un contenu.
              </div>
              <button
                onClick={onClose}
                className="mt-3 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          ) : (
            <>
              {/* Language selector */}
              {!generating && (
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-slate-300 flex-shrink-0">
                    Langue de génération
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="flex-1 bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
              )}

              {/* Progress bar */}
              {generating && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{done}/{tasks.length} nœuds générés</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div
                      className="bg-teal-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Success state */}
              {allDone && !generating && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
                  <span className="text-emerald-400">✓</span>
                  <span className="text-xs text-emerald-300 font-medium">
                    Tous les contenus ont été générés et appliqués au mindmap.
                  </span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">
                  {error}
                </div>
              )}

              {/* Task list */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <div
                    key={task.nodeId}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-lg text-xs
                      ${task.status === 'done'
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : task.status === 'error'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-slate-800 text-slate-400'}
                    `}
                  >
                    <span className="flex-shrink-0">
                      {task.status === 'done' ? '✓' : task.status === 'error' ? '✗' : generating ? (
                        <span className="inline-block w-3 h-3 border border-teal-500/40 border-t-teal-400 rounded-full animate-spin" />
                      ) : '○'}
                    </span>
                    <span className="flex-shrink-0 text-slate-500">{SUBTYPE_LABELS[task.subtype] ?? task.subtype}</span>
                    <span className="truncate">{task.name}</span>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              {!generating && !allDone && (
                <button
                  onClick={() => void handleGenerate()}
                  disabled={tasks.length === 0}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-sm text-white font-semibold
                             transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  📝 Générer les contenus
                </button>
              )}

              {allDone && !generating && (
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-semibold transition-colors"
                >
                  ✓ Terminé
                </button>
              )}

              {generating && (
                <button
                  onClick={handleCancel}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Annuler
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
