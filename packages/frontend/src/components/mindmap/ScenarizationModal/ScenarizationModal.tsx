import { useState, useRef, useCallback, useEffect } from 'react';
import {
  analyzeDocument,
  scenarizeFromDocument,
  scenarizeContent,
  type ScenarizationFile,
  type CourseDocument,
  type ContentTaskParams,
} from '@/api/llm-api';
import { useMindmapStore } from '@/stores/mindmap-store';
import type { MindmapNode, MindmapEdge, QuizQuestion } from '@/types/mindmap.types';

interface Props {
  onClose: () => void;
}

type Step = 'setup' | 'analyzing' | 'analysis_review' | 'structuring' | 'preview' | 'applied' | 'content_setup' | 'content_generating' | 'content_done';

interface ScenResult {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  meta: { courseName: string; summary: string; outcomes: string[]; competencies: string[] };
}

const LEVELS = [
  'Primaire', 'Collège', 'Lycée',
  'Enseignement supérieur (Licence)', 'Enseignement supérieur (Master)',
  'Formation professionnelle', 'Formation continue', 'Autre',
];
const LANGUAGES = ['Français', 'English', 'Español', 'Deutsch', 'Arabe', 'Portugais'];
const SUBTYPES_ICONS: Record<string, string> = {
  page: '📄', url: '🔗', book: '📗', file: '📎',
  quiz: '❓', assign: '📋', forum: '💬', lesson: '📘', feedback: '📊',
};

// ─── FileDropZone ──────────────────────────────────────────────────────────

function FileDropZone({
  files, onAdd, onRemove,
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
        results.push({ name: file.name, type: 'pdf', content: btoa(binary) });
      } else {
        results.push({ name: file.name, type: 'markdown', content: await file.text() });
      }
    }
    if (results.length) onAdd(results);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    void processFiles(e.dataTransfer.files);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors
          ${dragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-800'}`}
      >
        <div className="text-2xl mb-1">📂</div>
        <div className="text-sm text-slate-300 font-medium">Glisser des fichiers ici ou cliquer</div>
        <div className="text-xs text-slate-500 mt-1">PDF, Markdown (.md), Texte (.txt)</div>
        <input ref={inputRef} type="file" accept=".pdf,.md,.markdown,.txt" multiple className="hidden"
          onChange={(e) => void processFiles(e.target.files)} />
      </div>
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
              <span>{f.type === 'pdf' ? '📕' : '📝'}</span>
              <span className="flex-1 text-xs text-slate-300 truncate">{f.name}</span>
              <span className="text-xs text-slate-500 uppercase">{f.type}</span>
              <button onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="text-slate-600 hover:text-red-400 text-sm">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GeneratingView ────────────────────────────────────────────────────────

function GeneratingView({
  stepLabel, statusMessage, streamText, onCancel,
}: {
  stepLabel: string;
  statusMessage: string;
  streamText: string;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <span className="w-4 h-4 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
        <div>
          <div className="text-xs text-indigo-400 font-medium uppercase tracking-wide">{stepLabel}</div>
          <div>{statusMessage}</div>
        </div>
      </div>
      {streamText && (
        <div className="bg-slate-800/80 rounded-lg p-3 max-h-36 overflow-y-auto">
          <div className="text-xs text-slate-500 mb-1">Génération en cours…</div>
          <div className="text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
            {streamText.slice(-700)}
            <span className="inline-block w-1.5 h-3 bg-indigo-400 animate-pulse ml-0.5" />
          </div>
        </div>
      )}
      <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
        Annuler
      </button>
    </div>
  );
}

// ─── AnalysisReview (checkpoint 1) ────────────────────────────────────────

function AnalysisReview({
  doc, onContinue, onBack,
}: {
  doc: CourseDocument;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Course header */}
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-3">
        <div>
          <div className="text-xs text-indigo-400 font-medium uppercase tracking-wide mb-1">Document du cours généré</div>
          <div className="text-base font-semibold text-white">{doc.courseName}
            <span className="ml-2 text-xs font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{doc.shortname}</span>
          </div>
        </div>
        {doc.globalDescription && (
          <p className="text-xs text-slate-300 leading-relaxed">{doc.globalDescription}</p>
        )}
        {doc.outcomes.length > 0 && (
          <div>
            <div className="text-xs text-slate-400 font-medium mb-1">Résultats attendus</div>
            <ul className="space-y-0.5">
              {doc.outcomes.map((o, i) => (
                <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                  <span className="text-emerald-400 mt-0.5">→</span> {o}
                </li>
              ))}
            </ul>
          </div>
        )}
        {doc.competencies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {doc.competencies.map((c, i) => (
              <span key={i} className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">{c}</span>
            ))}
          </div>
        )}
      </div>

      {/* Sections */}
      <div>
        <div className="text-xs text-slate-400 font-medium mb-2">
          Modules analysés — {doc.sections.length} section{doc.sections.length > 1 ? 's' : ''}
        </div>
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {doc.sections.map((s, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-3">
              <div className="text-sm font-medium text-emerald-400 mb-1 flex items-center gap-1.5">
                <span>📂</span> {s.name}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{s.contentSummary}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs text-amber-200/80">
        ⚠ Vérifie que l'analyse correspond à tes attentes avant de générer la structure.
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onBack}
          className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
          ← Modifier
        </button>
        <button onClick={onContinue}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors flex items-center justify-center gap-2">
          Générer la structure →
        </button>
      </div>
    </div>
  );
}

// ─── PreviewView (checkpoint 2) ────────────────────────────────────────────

function PreviewView({
  result, onApply, onBack,
}: {
  result: ScenResult;
  onApply: () => void;
  onBack: () => void;
}) {
  const nodesBySection = result.nodes.filter((n) => n.type === 'section');
  return (
    <div className="space-y-5">
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-3">
        <div>
          <div className="text-xs text-indigo-400 font-medium uppercase tracking-wide mb-1">Structure générée</div>
          <div className="text-base font-semibold text-white">{result.meta.courseName}</div>
        </div>
        {result.meta.outcomes.length > 0 && (
          <ul className="space-y-0.5">
            {result.meta.outcomes.map((o, i) => (
              <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">→</span> {o}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="text-xs text-slate-400 font-medium mb-2">
          {nodesBySection.length} section{nodesBySection.length > 1 ? 's' : ''}
        </div>
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {nodesBySection.map((secNode) => {
            const children = result.edges
              .filter((e) => e.source === secNode.id)
              .map((e) => result.nodes.find((n) => n.id === e.target))
              .filter(Boolean) as MindmapNode[];
            const secData = secNode.data as unknown as { name: string };
            return (
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
                        <span className="text-slate-600">({child.type}{d.subtype ? `/${d.subtype as string}` : ''})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 text-xs text-slate-500">
        <span>{result.nodes.length} nœuds</span>
        <span>•</span>
        <span>{result.edges.length} connexions</span>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onBack}
          className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
          ← Refaire
        </button>
        <button onClick={onApply}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors flex items-center justify-center gap-2">
          ✨ Appliquer au mindmap
        </button>
      </div>
    </div>
  );
}

// ─── buildContentTasks ─────────────────────────────────────────────────────

function buildContentTasks(nodes: MindmapNode[], edges: MindmapEdge[]): ContentTaskParams[] {
  const tasks: ContentTaskParams[] = [];
  const sectionNodes = nodes.filter(n => n.type === 'section');
  for (const sec of sectionNodes) {
    const secData = sec.data as unknown as { contentContext?: string };
    const ctx = secData.contentContext ?? '';
    const childIds = edges.filter(e => e.source === sec.id).map(e => e.target);
    for (const childId of childIds) {
      const child = nodes.find(n => n.id === childId);
      if (!child) continue;
      const d = child.data as unknown as Record<string, unknown>;
      const subtype = d.subtype as string;
      if (subtype === 'page' || subtype === 'quiz') {
        tasks.push({
          nodeId: child.id,
          subtype: subtype as 'page' | 'quiz',
          name: (d.name as string) ?? '',
          description: (d.description as string) ?? '',
          contentContext: ctx,
          questionCount: d.questionCount as number | undefined,
        });
      }
    }
  }
  return tasks;
}

// ─── Main component ────────────────────────────────────────────────────────

export function ScenarizationModal({ onClose }: Props) {
  const { replaceContent, setProjectName, updateNode } = useMindmapStore();

  // Setup state
  const [files, setFiles] = useState<ScenarizationFile[]>([]);
  const [level, setLevel] = useState('Lycée');
  const [duration, setDuration] = useState('');
  const [moduleCount, setModuleCount] = useState(4);
  const [language, setLanguage] = useState('Français');
  const [additionalContext, setAdditionalContext] = useState('');

  // Flow state
  const [step, setStep] = useState<Step>('setup');
  const [statusMessage, setStatusMessage] = useState('');
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [courseDocument, setCourseDocument] = useState<CourseDocument | null>(null);
  const [result, setResult] = useState<ScenResult | null>(null);
  const [applied, setApplied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Phase 2 — content generation state
  const [contentFiles, setContentFiles] = useState<ScenarizationFile[]>([]);
  const [contentAdditionalText, setContentAdditionalText] = useState('');
  const [contentProgress, setContentProgress] = useState({ done: 0, total: 0, currentName: '' });
  const [contentTasks, setContentTasks] = useState<ContentTaskParams[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── Step A: analyze document ──────────────────────────────────────────────
  const handleAnalyze = async () => {
    setError('');
    setStreamText('');
    setCourseDocument(null);
    setResult(null);
    setApplied(false);
    setStep('analyzing');
    setStatusMessage(files.length > 0 ? 'Lecture et analyse des documents…' : 'Analyse des paramètres…');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await analyzeDocument(
        { files, level, duration, moduleCount, language, additionalContext: additionalContext || undefined },
        (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === 'progress') {
            setStatusMessage((d.message as string) ?? '');
          } else if (event === 'delta') {
            setStreamText((prev) => prev + ((d.text as string) ?? ''));
          } else if (event === 'done') {
            const doc = d.courseDocument as CourseDocument;
            setCourseDocument(doc);
            setStep('analysis_review');
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

  // ── Step B: generate structure ────────────────────────────────────────────
  const handleStructure = async () => {
    if (!courseDocument) return;
    setError('');
    setStreamText('');
    setResult(null);
    setStep('structuring');
    setStatusMessage('Génération de la structure du parcours…');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await scenarizeFromDocument(
        { courseDocument, level, duration, moduleCount, language, additionalContext: additionalContext || undefined },
        (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === 'progress') {
            setStatusMessage((d.message as string) ?? '');
          } else if (event === 'delta') {
            setStreamText((prev) => prev + ((d.text as string) ?? ''));
          } else if (event === 'done') {
            const nodes = (d.nodes as MindmapNode[]) ?? [];
            const edges = (d.edges as MindmapEdge[]) ?? [];
            const meta = (d.meta as ScenResult['meta']) ?? { courseName: '', summary: '', outcomes: [], competencies: [] };
            setResult({ nodes, edges, meta });
            setStep('preview');
          } else if (event === 'error') {
            setError((d.message as string) ?? 'Erreur inconnue');
            setStep('analysis_review');
          }
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
        setStep('analysis_review');
      } else {
        setStep('analysis_review');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    if (step === 'analyzing') setStep('setup');
    else if (step === 'structuring') setStep('analysis_review');
    else if (step === 'content_generating') setStep('content_setup');
  };

  const handleApply = () => {
    if (!result) return;
    replaceContent(result.nodes, result.edges);
    if (result.meta.courseName) setProjectName(result.meta.courseName);
    const tasks = buildContentTasks(result.nodes, result.edges);
    setContentTasks(tasks);
    setApplied(true);
    setStep('applied');
  };

  const handleGenerateContent = async () => {
    if (!result) return;
    const tasks = contentTasks.length > 0 ? contentTasks : buildContentTasks(result.nodes, result.edges);
    if (tasks.length === 0) return;

    setStep('content_generating');
    setError('');
    setContentProgress({ done: 0, total: tasks.length, currentName: '' });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await scenarizeContent(
        tasks,
        language,
        (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === 'progress') {
            setContentProgress(prev => ({ ...prev, currentName: (d.message as string) ?? '' }));
          } else if (event === 'node_done') {
            const nodeId = d.nodeId as string;
            if (d.content !== undefined) updateNode(nodeId, { content: d.content as string });
            if (d.questions !== undefined) updateNode(nodeId, { questions: d.questions as QuizQuestion[] });
            setContentProgress({ done: (d.index as number) ?? 0, total: (d.total as number) ?? tasks.length, currentName: (d.name as string) ?? '' });
          } else if (event === 'done') {
            setStep('content_done');
          } else if (event === 'error') {
            setError((d.message as string) ?? 'Erreur inconnue');
            setStep('content_setup');
          }
        },
        controller.signal,
        contentFiles,
        contentAdditionalText || undefined,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
        setStep('content_setup');
      } else {
        setStep('content_setup');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const canGenerate = level.trim() && duration.trim() && moduleCount >= 1;

  // ── Header label ──────────────────────────────────────────────────────────
  const headerSub = {
    setup: 'Paramétrez et analysez vos documents de formation',
    analyzing: 'Analyse des documents en cours…',
    analysis_review: 'Vérifiez le document pédagogique avant de continuer',
    structuring: 'Génération de la structure du mindmap…',
    preview: 'Aperçu de la structure générée',
    applied: '',
    content_setup: 'Ajoutez des ressources pour enrichir le contenu',
    content_generating: 'Génération des contenus en cours…',
    content_done: '',
  }[step];

  const isGenerating = step === 'analyzing' || step === 'structuring' || step === 'content_generating';

  // ── Step label for GeneratingView ─────────────────────────────────────────
  const stepLabel = step === 'analyzing' ? 'Étape 1 / 2 — Analyse documentaire' : 'Étape 2 / 2 — Structure mindmap';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>🎓</span> Scénarisation IA
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{headerSub}</p>
          </div>
          <button
            onClick={isGenerating ? handleCancel : onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Progress indicator (steps 1 & 2) */}
        {(step === 'analyzing' || step === 'analysis_review' || step === 'structuring' || step === 'preview') && (
          <div className="px-6 pt-4 flex items-center gap-2">
            {[
              { key: 'analyze', label: 'Analyse', steps: ['analyzing', 'analysis_review', 'structuring', 'preview'] },
              { key: 'structure', label: 'Structure', steps: ['structuring', 'preview'] },
            ].map((s, i) => {
              const done = s.steps.includes(step) && i === 0 && (step === 'analysis_review' || step === 'structuring' || step === 'preview');
              const active = (i === 0 && step === 'analyzing') || (i === 1 && (step === 'structuring' || step === 'preview'));
              return (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                    ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500'}`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <div className={`ml-2 text-xs ${done ? 'text-emerald-400' : active ? 'text-white font-medium' : 'text-slate-500'}`}>
                    {s.label}
                  </div>
                  {i === 0 && <div className={`h-px flex-1 mx-3 ${done ? 'bg-emerald-500/40' : 'bg-slate-700'}`} />}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* SETUP */}
          {step === 'setup' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Fichiers source <span className="text-slate-500 font-normal">(optionnel)</span>
                </label>
                <FileDropZone
                  files={files}
                  onAdd={(f) => setFiles((prev) => [...prev, ...f])}
                  onRemove={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Niveau <span className="text-red-400">*</span></label>
                  <select value={level} onChange={(e) => setLevel(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none">
                    {LEVELS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Durée <span className="text-red-400">*</span></label>
                  <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)}
                    placeholder="ex: 8 semaines, 30 heures…"
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Nombre de modules <span className="text-red-400">*</span></label>
                  <input type="number" min={1} max={20} value={moduleCount}
                    onChange={(e) => setModuleCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Langue</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none">
                    {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Contexte additionnel <span className="text-slate-500 font-normal">(optionnel)</span>
                </label>
                <textarea value={additionalContext} onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Focus sur les exercices pratiques, inclure des parcours conditionnels…"
                  rows={3}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none" />
              </div>
              <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                <p className="text-xs text-amber-200/80">
                  La génération remplacera <strong>entièrement</strong> le mindmap actuel.
                  Le processus se déroule en 2 étapes avec validation entre chaque étape.
                </p>
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">{error}</div>
              )}
              <button
                onClick={() => void handleAnalyze()}
                disabled={!canGenerate}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                🔍 Analyser {files.length > 0 ? `(${files.length} fichier${files.length > 1 ? 's' : ''})` : 'et générer'}
              </button>
            </div>
          )}

          {/* ANALYZING */}
          {step === 'analyzing' && (
            <GeneratingView
              stepLabel={stepLabel}
              statusMessage={statusMessage}
              streamText={streamText}
              onCancel={handleCancel}
            />
          )}

          {/* ANALYSIS REVIEW — checkpoint 1 */}
          {step === 'analysis_review' && courseDocument && (
            <>
              {error && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">{error}</div>
              )}
              <AnalysisReview
                doc={courseDocument}
                onContinue={() => void handleStructure()}
                onBack={() => { setStep('setup'); setError(''); }}
              />
            </>
          )}

          {/* STRUCTURING */}
          {step === 'structuring' && (
            <GeneratingView
              stepLabel={stepLabel}
              statusMessage={statusMessage}
              streamText={streamText}
              onCancel={handleCancel}
            />
          )}

          {/* PREVIEW — checkpoint 2 */}
          {step === 'preview' && result && (
            <>
              {error && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">{error}</div>
              )}
              <PreviewView
                result={result}
                onApply={handleApply}
                onBack={() => { setStep('analysis_review'); setError(''); }}
              />
            </>
          )}

          {/* APPLIED */}
          {step === 'applied' && (
            <div className="py-6 text-center space-y-5">
              <div className="text-3xl">✅</div>
              <div className="text-sm font-medium text-emerald-400">Mindmap mis à jour !</div>
              {result && contentTasks.length > 0 && (
                <div className="text-xs text-slate-400">
                  {contentTasks.length} nœuds à enrichir (pages HTML + questions quiz)
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
                  Fermer
                </button>
                {result && contentTasks.length > 0 && (
                  <button onClick={() => { setStep('content_setup'); setError(''); }}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors">
                    📝 Générer les contenus →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* CONTENT SETUP */}
          {step === 'content_setup' && result && (
            <div className="space-y-5">
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-2">
                  {contentTasks.length} nœuds à générer
                  {contentTasks.filter(t => t.subtype === 'page').length > 0 &&
                    ` — ${contentTasks.filter(t => t.subtype === 'page').length} pages HTML`}
                  {contentTasks.filter(t => t.subtype === 'quiz').length > 0 &&
                    ` — ${contentTasks.filter(t => t.subtype === 'quiz').length} quiz`}
                </div>
                <div className="space-y-0.5 max-h-28 overflow-y-auto">
                  {contentTasks.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{t.subtype === 'page' ? '📄' : '❓'}</span>
                      <span className="truncate">{t.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Documents sources <span className="text-slate-500 font-normal">(optionnel — enrichit le contenu)</span>
                </label>
                <FileDropZone
                  files={contentFiles}
                  onAdd={(f) => setContentFiles(prev => [...prev, ...f])}
                  onRemove={(idx) => setContentFiles(prev => prev.filter((_, i) => i !== idx))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Contexte additionnel <span className="text-slate-500 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={contentAdditionalText}
                  onChange={(e) => setContentAdditionalText(e.target.value)}
                  placeholder="Instructions spécifiques, terminologie, niveau de détail…"
                  rows={3}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">{error}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => { setStep('applied'); setError(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
                  ← Retour
                </button>
                <button onClick={() => void handleGenerateContent()}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors flex items-center justify-center gap-2">
                  ✨ Générer les contenus
                </button>
              </div>
            </div>
          )}

          {/* CONTENT GENERATING */}
          {step === 'content_generating' && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-4 h-4 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
                <div>
                  <div className="text-xs text-indigo-400 font-medium uppercase tracking-wide">Génération des contenus</div>
                  <div className="truncate">{contentProgress.currentName || 'En cours…'}</div>
                </div>
              </div>
              {contentProgress.total > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{contentProgress.done} / {contentProgress.total} nœuds</span>
                    <span>{Math.round((contentProgress.done / contentProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${(contentProgress.done / contentProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button onClick={handleCancel} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Annuler
              </button>
            </div>
          )}

          {/* CONTENT DONE */}
          {step === 'content_done' && (
            <div className="py-8 text-center space-y-3">
              <div className="text-3xl">🎉</div>
              <div className="text-sm font-medium text-emerald-400">Contenus générés !</div>
              <div className="text-xs text-slate-500">{contentProgress.total} nœuds mis à jour dans le mindmap</div>
              <button onClick={onClose}
                className="mt-4 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors">
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
