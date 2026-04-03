import { useState, useRef, useCallback, useEffect } from 'react';
import { scenarizeCourseStructure, type ScenarizationFile } from '@/api/llm-api';
import { useMindmapStore } from '@/stores/mindmap-store';
import type { MindmapNode, MindmapEdge } from '@/types/mindmap.types';

interface Props {
  onClose: () => void;
}

type Step = 'setup' | 'generating' | 'preview';

interface ScenMeta {
  courseName: string;
  summary: string;
  outcomes: string[];
  competencies: string[];
}

interface ScenResult {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  meta: ScenMeta;
}

const LEVELS = [
  'Primaire',
  'Collège',
  'Lycée',
  'Enseignement supérieur (Licence)',
  'Enseignement supérieur (Master)',
  'Formation professionnelle',
  'Formation continue',
  'Autre',
];

const LANGUAGES = ['Français', 'English', 'Español', 'Deutsch', 'Arabe', 'Portugais'];

const SUBTYPES_ICONS: Record<string, string> = {
  page: '📄',
  url: '🔗',
  book: '📗',
  file: '📎',
  quiz: '❓',
  assign: '📋',
  forum: '💬',
  lesson: '📘',
  feedback: '📊',
};

// ─── File drop zone ───────────────────────────────────────────────────────────

function FileDropZone({
  files,
  onAdd,
  onRemove,
}: {
  files: ScenarizationFile[];
  onAdd: (files: ScenarizationFile[]) => void;
  onRemove: (idx: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const processFiles = async (rawFiles: FileList | null) => {
    if (!rawFiles) return;
    const results: ScenarizationFile[] = [];

    for (const file of Array.from(rawFiles)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const isPdf = file.type === 'application/pdf' || ext === 'pdf';
      const isMd = ext === 'md' || ext === 'markdown' || ext === 'txt';

      if (!isPdf && !isMd) continue;

      if (isPdf) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        results.push({ name: file.name, type: 'pdf', content: base64 });
      } else {
        const text = await file.text();
        results.push({ name: file.name, type: 'markdown', content: text });
      }
    }

    if (results.length) onAdd(results);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void processFiles(e.dataTransfer.files);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors
          ${dragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-slate-600 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-800'
          }
        `}
      >
        <div className="text-2xl mb-1">📂</div>
        <div className="text-sm text-slate-300 font-medium">
          Glisser des fichiers ici ou cliquer pour sélectionner
        </div>
        <div className="text-xs text-slate-500 mt-1">PDF, Markdown (.md), Texte (.txt)</div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          multiple
          className="hidden"
          onChange={(e) => void processFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
              <span className="text-base">{f.type === 'pdf' ? '📕' : '📝'}</span>
              <span className="flex-1 text-xs text-slate-300 truncate">{f.name}</span>
              <span className="text-xs text-slate-500 uppercase">{f.type}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="text-slate-600 hover:text-red-400 text-sm transition-colors"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Progress step ────────────────────────────────────────────────────────────

const PROGRESS_STEPS = [
  { key: 'structure',  label: 'Analyse & Structure' },
  { key: 'converting', label: 'Mindmap' },
];

function ProgressView({
  currentStep,
  statusMessage,
  streamText,
  onCancel,
}: {
  currentStep: string;
  statusMessage: string;
  streamText: string;
  onCancel: () => void;
}) {
  const stepIdx = PROGRESS_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="space-y-5 py-2">
      {/* Step indicators */}
      <div className="flex items-center">
        {PROGRESS_STEPS.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className={`
                w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500'}
              `}>
                {done ? '✓' : i + 1}
              </div>
              <div className="ml-2 text-xs flex-1">
                <div className={done ? 'text-emerald-400' : active ? 'text-white font-medium' : 'text-slate-500'}>
                  {s.label}
                </div>
              </div>
              {i < PROGRESS_STEPS.length - 1 && (
                <div className={`h-px flex-1 mx-3 ${done ? 'bg-emerald-500/40' : 'bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Status message */}
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <span className="w-4 h-4 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
        {statusMessage}
      </div>

      {/* Stream preview */}
      {streamText && (
        <div className="bg-slate-800/80 rounded-lg p-3 max-h-32 overflow-y-auto">
          <div className="text-xs text-slate-500 mb-1">Structure en cours…</div>
          <div className="text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
            {streamText.slice(-600)}
            <span className="inline-block w-1.5 h-3 bg-indigo-400 animate-pulse ml-0.5" />
          </div>
        </div>
      )}

      <button
        onClick={onCancel}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        Annuler
      </button>
    </div>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function PreviewView({
  result,
  onApply,
  onBack,
}: {
  result: ScenResult;
  onApply: () => void;
  onBack: () => void;
}) {
  const nodesBySection = result.nodes.filter((n) => n.type === 'section');

  return (
    <div className="space-y-5">
      {/* Course info */}
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-3">
        <div>
          <div className="text-xs text-indigo-400 font-medium uppercase tracking-wide mb-1">Cours généré</div>
          <div className="text-base font-semibold text-white">{result.meta.courseName}</div>
          {result.meta.summary && (
            <div
              className="text-xs text-slate-400 mt-1"
              dangerouslySetInnerHTML={{ __html: result.meta.summary }}
            />
          )}
        </div>

        {result.meta.outcomes.length > 0 && (
          <div>
            <div className="text-xs text-slate-400 font-medium mb-1">Résultats attendus</div>
            <ul className="space-y-0.5">
              {result.meta.outcomes.map((o, i) => (
                <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                  <span className="text-emerald-400 mt-0.5">→</span> {o}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.meta.competencies.length > 0 && (
          <div>
            <div className="text-xs text-slate-400 font-medium mb-1">Compétences</div>
            <div className="flex flex-wrap gap-1.5">
              {result.meta.competencies.map((c, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Structure preview */}
      <div>
        <div className="text-xs text-slate-400 font-medium mb-2">
          Structure — {nodesBySection.length} section{nodesBySection.length > 1 ? 's' : ''}
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {nodesBySection.map((secNode) => {
            const secEdge = result.edges.find((e) => e.target === secNode.id);
            const children = result.edges
              .filter((e) => e.source === secNode.id)
              .map((e) => result.nodes.find((n) => n.id === e.target))
              .filter(Boolean) as MindmapNode[];

            // Branches (children of quiz nodes within this section)
            const branchEdges = result.edges.filter((e) => {
              const src = result.nodes.find((n) => n.id === e.source);
              return src && src.type !== 'section' && result.nodes.find((n) => n.id === e.target)?.type === 'branch';
            });
            const branchesInSection = branchEdges
              .map((e) => result.nodes.find((n) => n.id === e.target))
              .filter(Boolean) as MindmapNode[];

            const secData = secNode.data as unknown as { name: string };

            return secEdge ? (
              <div key={secNode.id} className="bg-slate-800 rounded-lg p-3">
                <div className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                  <span>📂</span> {secData.name}
                </div>
                <div className="mt-1.5 space-y-0.5 pl-2">
                  {children.map((child) => {
                    const d = child.data as unknown as Record<string, unknown>;
                    const icon = SUBTYPES_ICONS[(d.subtype as string) ?? child.type] ?? '📦';
                    return (
                      <div key={child.id} className="text-xs text-slate-400 flex items-center gap-1.5">
                        <span>{icon}</span>
                        <span>{(d.name as string) ?? child.id}</span>
                        <span className="text-slate-600 ml-0.5">({child.type}{d.subtype ? `/${d.subtype as string}` : ''})</span>
                      </div>
                    );
                  })}
                  {branchesInSection.map((branch) => (
                    <div key={branch.id} className="text-xs text-indigo-400 flex items-center gap-1.5 pl-3">
                      <span>⬦</span>
                      <span>Branchement conditionnel</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-xs text-slate-500">
        <span>{result.nodes.length} nœuds</span>
        <span>•</span>
        <span>{result.edges.length} connexions</span>
        <span>•</span>
        <span>{result.nodes.filter((n) => n.type === 'branch').length} branchements</span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors"
        >
          ← Modifier
        </button>
        <button
          onClick={onApply}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors flex items-center justify-center gap-2"
        >
          ✨ Appliquer au mindmap
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScenarizationModal({ onClose }: Props) {
  const { replaceContent, setProjectName } = useMindmapStore();

  // Setup state
  const [files, setFiles] = useState<ScenarizationFile[]>([]);
  const [level, setLevel] = useState('Lycée');
  const [duration, setDuration] = useState('');
  const [moduleCount, setModuleCount] = useState(4);
  const [language, setLanguage] = useState('Français');
  const [additionalContext, setAdditionalContext] = useState('');

  // Flow state
  const [step, setStep] = useState<Step>('setup');
  const [currentProgressStep, setCurrentProgressStep] = useState('structure');
  const [statusMessage, setStatusMessage] = useState('');
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScenResult | null>(null);
  const [applied, setApplied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Prevent scroll propagation on mount
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleGenerate = async () => {
    setError('');
    setStreamText('');
    setResult(null);
    setApplied(false);
    setStep('generating');
    setCurrentProgressStep('structure');
    setStatusMessage('Analyse des fichiers…');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await scenarizeCourseStructure(
        { files, level, duration, moduleCount, language, additionalContext: additionalContext || undefined },
        (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === 'progress') {
            setCurrentProgressStep((d.step as string) ?? 'structure');
            setStatusMessage((d.message as string) ?? '');
          } else if (event === 'delta') {
            setStreamText((prev) => prev + ((d.text as string) ?? ''));
          } else if (event === 'done') {
            const nodes = (d.nodes as MindmapNode[]) ?? [];
            const edges = (d.edges as MindmapEdge[]) ?? [];
            const meta = (d.meta as ScenMeta) ?? { courseName: '', summary: '', outcomes: [], competencies: [] };
            setResult({ nodes, edges, meta });
            setStep('preview');
          } else if (event === 'error') {
            setError((d.message as string) ?? 'Erreur inconnue');
            setStep('setup');
          }
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
        setStep('setup');
      } else {
        setStep('setup');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setStep('setup');
  };

  const handleApply = () => {
    if (!result) return;
    replaceContent(result.nodes, result.edges);
    if (result.meta.courseName) setProjectName(result.meta.courseName);
    setApplied(true);
    setTimeout(onClose, 800);
  };

  const canGenerate = level.trim() && duration.trim() && moduleCount >= 1;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>🎓</span> Scénarisation IA
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'setup' && 'Génère la structure du cours (Phase 1) à partir de tes fichiers'}
              {step === 'generating' && 'Génération du cours en cours…'}
              {step === 'preview' && 'Aperçu du cours généré'}
            </p>
          </div>
          <button
            onClick={step === 'generating' ? handleCancel : onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── SETUP STEP ── */}
          {step === 'setup' && (
            <div className="space-y-5">
              {/* Files */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Fichiers source <span className="text-slate-500 font-normal">(optionnel)</span>
                </label>
                <FileDropZone
                  files={files}
                  onAdd={(newFiles) => setFiles((prev) => [...prev, ...newFiles])}
                  onRemove={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                />
              </div>

              {/* Parameters grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Niveau <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    {LEVELS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Durée <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="ex: 8 semaines, 30 heures…"
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Nombre de modules <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={moduleCount}
                    onChange={(e) => setModuleCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Langue de sortie</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* Additional context */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Contexte additionnel <span className="text-slate-500 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Focus sur les exercices pratiques, inclure des parcours conditionnels, thème spécifique…"
                  rows={3}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700
                             focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                <p className="text-xs text-amber-200/80">
                  La génération remplacera <strong>entièrement</strong> le mindmap actuel. L'opération est annulable via Undo.
                  Les contenus détaillés (pages, quiz) seront générés séparément via <strong>📝 Contenus</strong> après validation.
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">
                  {error}
                </div>
              )}

              <button
                onClick={() => void handleGenerate()}
                disabled={!canGenerate}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold
                           transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                🎓 Générer la structure
              </button>
            </div>
          )}

          {/* ── GENERATING STEP ── */}
          {step === 'generating' && (
            <ProgressView
              currentStep={currentProgressStep}
              statusMessage={statusMessage}
              streamText={streamText}
              onCancel={handleCancel}
            />
          )}

          {/* ── PREVIEW STEP ── */}
          {step === 'preview' && result && !applied && (
            <PreviewView
              result={result}
              onApply={handleApply}
              onBack={() => setStep('setup')}
            />
          )}

          {applied && (
            <div className="py-8 text-center space-y-2">
              <div className="text-3xl">✅</div>
              <div className="text-sm font-medium text-emerald-400">Mindmap mis à jour !</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
