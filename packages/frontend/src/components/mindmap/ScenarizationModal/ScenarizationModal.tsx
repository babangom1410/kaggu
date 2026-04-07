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
import {
  BUILTIN_PROFILES,
  DEFAULT_CUSTOM_PROFILE,
  BLOOM_OPTIONS,
  STYLE_OPTIONS,
  DENSITY_OPTIONS,
  DEPTH_OPTIONS,
  DIFFICULTY_OPTIONS,
  buildPedagogicalInstructions,
  type ScenarizationProfile,
} from '@/data/scenarization-profiles';

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

  function addIfGeneratable(node: MindmapNode, ctx: string) {
    const d = node.data as unknown as Record<string, unknown>;
    const subtype = d.subtype as string;
    if (subtype === 'page' || subtype === 'quiz' || subtype === 'book' || subtype === 'lesson') {
      tasks.push({
        nodeId: node.id,
        subtype: subtype as 'page' | 'quiz' | 'book' | 'lesson',
        name: (d.name as string) ?? '',
        description: (d.description as string) ?? '',
        contentContext: ctx,
        questionCount: d.questionCount as number | undefined,
        chapterCount: d.chapterCount as number | undefined,
        pageCount: d.pageCount as number | undefined,
      });
    }
  }

  const sectionNodes = nodes.filter(n => n.type === 'section');
  for (const sec of sectionNodes) {
    const secData = sec.data as unknown as { contentContext?: string };
    const ctx = secData.contentContext ?? '';
    const childIds = edges.filter(e => e.source === sec.id).map(e => e.target);
    for (const childId of childIds) {
      const child = nodes.find(n => n.id === childId);
      if (!child) continue;
      if (child.type === 'branch') {
        // BranchNode: collect trueNode/falseNode children too
        const branchChildIds = edges.filter(e => e.source === child.id).map(e => e.target);
        for (const bcId of branchChildIds) {
          const bc = nodes.find(n => n.id === bcId);
          if (bc) addIfGeneratable(bc, ctx);
        }
      } else {
        addIfGeneratable(child, ctx);
      }
    }
  }
  return tasks;
}

// ─── ProfileSelector ──────────────────────────────────────────────────────

const DENSITY_LABELS: Record<string, string> = { low: 'Éval. légères', medium: 'Éval. modérées', high: 'Éval. denses' };
const DEPTH_LABELS: Record<string, string>   = { overview: 'Survol', standard: 'Standard', deep: 'Approfondi' };

function ToggleGroup<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-700">
      {options.map((opt) => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 text-xs transition-colors
            ${value === opt.value
              ? 'bg-indigo-500 text-white font-medium'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'}`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const BLOOM_INDEX = BLOOM_OPTIONS.reduce<Record<string, number>>((acc, b, i) => { acc[b.value] = i; return acc; }, {});

function ProfileSelector({
  selected, onSelect,
}: {
  selected: ScenarizationProfile | null;
  onSelect: (p: ScenarizationProfile | null) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [custom, setCustom] = useState<ScenarizationProfile>(DEFAULT_CUSTOM_PROFILE);
  const isCustomSelected = selected?.id === 'custom';

  const updateCustom = (updates: Partial<ScenarizationProfile>) => {
    const updated = { ...custom, ...updates };
    setCustom(updated);
    if (isCustomSelected) onSelect(updated);
  };

  const selectBuiltin = (p: ScenarizationProfile) => {
    setShowPreview(false);
    onSelect(selected?.id === p.id ? null : p);
  };

  const toggleCustom = () => {
    setShowPreview(false);
    if (isCustomSelected) { onSelect(null); } else { onSelect(custom); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-300">
          Profil pédagogique <span className="text-slate-500 font-normal">(optionnel)</span>
        </label>
        {selected && (
          <button onClick={() => { onSelect(null); setShowPreview(false); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ✕ Aucun profil
          </button>
        )}
      </div>

      {/* Built-in profiles grid */}
      <div className="grid grid-cols-2 gap-2">
        {BUILTIN_PROFILES.map((p) => {
          const isSelected = selected?.id === p.id;
          return (
            <button key={p.id} onClick={() => selectBuiltin(p)}
              className={`text-left rounded-xl border p-3 transition-all
                ${isSelected
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base leading-none">{p.icon}</span>
                <span className={`text-xs font-semibold ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>{p.name}</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight mb-2">{p.tagline}</p>
              <div className="flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] leading-none">{p.bloomLabel}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 text-[10px] leading-none">{p.styleIcon} {p.styleLabel}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 text-[10px] leading-none">{DENSITY_LABELS[p.evaluationDensity]}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 text-[10px] leading-none">{DEPTH_LABELS[p.contentDepth]}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom profile card */}
      <button onClick={toggleCustom}
        className={`w-full text-left rounded-xl border p-3 transition-all
          ${isCustomSelected
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-dashed border-slate-600 hover:border-indigo-500/50 hover:bg-slate-800/50'}`}>
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">✏️</span>
          <div className="min-w-0">
            <span className={`text-xs font-semibold ${isCustomSelected ? 'text-indigo-300' : 'text-slate-300'}`}>
              Profil personnalisé
            </span>
            {isCustomSelected ? (
              <span className="ml-2 text-[11px] text-slate-500">
                Bloom: {custom.bloomLabel} · {custom.styleIcon} {custom.styleLabel} · {custom.practicalRatio}% pratique
              </span>
            ) : (
              <span className="ml-2 text-[11px] text-slate-500">Configurer mes propres paramètres</span>
            )}
          </div>
        </div>
      </button>

      {/* Custom editor — expanded when custom is selected */}
      {isCustomSelected && (
        <div className="border border-indigo-500/20 rounded-xl p-4 space-y-4 bg-slate-800/30">

          {/* Bloom level */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">Niveau Bloom</label>
              <span className="text-xs text-indigo-300 font-medium">{custom.bloomLabel}</span>
            </div>
            <input
              type="range" min={0} max={5} step={1}
              value={BLOOM_INDEX[custom.bloomLevel] ?? 2}
              onChange={(e) => {
                const opt = BLOOM_OPTIONS[Number(e.target.value)];
                updateCustom({ bloomLevel: opt.value, bloomLabel: opt.label });
              }}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 px-0.5">
              {BLOOM_OPTIONS.map((b) => (
                <span key={b.value} className={custom.bloomLevel === b.value ? 'text-indigo-400 font-medium' : ''}>
                  {b.short}
                </span>
              ))}
            </div>
          </div>

          {/* Pedagogical style */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Style pédagogique</label>
            <ToggleGroup
              value={custom.pedagogicalStyle}
              onChange={(v) => {
                const opt = STYLE_OPTIONS.find(s => s.value === v)!;
                updateCustom({ pedagogicalStyle: v, styleLabel: opt.label, styleIcon: opt.icon });
              }}
              options={STYLE_OPTIONS.map(s => ({ value: s.value, label: `${s.icon} ${s.label}` }))}
            />
          </div>

          {/* Practical ratio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">Ratio pratique / théorique</label>
              <span className="text-xs text-indigo-300 font-medium">{custom.practicalRatio}% pratique</span>
            </div>
            <input
              type="range" min={10} max={90} step={5}
              value={custom.practicalRatio}
              onChange={(e) => updateCustom({ practicalRatio: Number(e.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>Théorique (10%)</span>
              <span className="text-slate-600">Équilibré (50%)</span>
              <span>Pratique (90%)</span>
            </div>
          </div>

          {/* Evaluation density */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Densité des évaluations</label>
            <ToggleGroup
              value={custom.evaluationDensity}
              onChange={(v) => updateCustom({ evaluationDensity: v })}
              options={DENSITY_OPTIONS}
            />
          </div>

          {/* Content depth */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Profondeur des contenus</label>
            <ToggleGroup
              value={custom.contentDepth}
              onChange={(v) => updateCustom({ contentDepth: v })}
              options={DEPTH_OPTIONS}
            />
          </div>

          {/* Quiz difficulty */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Difficulté des quiz</label>
            <ToggleGroup
              value={custom.quizDifficulty}
              onChange={(v) => updateCustom({ quizDifficulty: v })}
              options={DIFFICULTY_OPTIONS}
            />
          </div>
        </div>
      )}

      {/* Instructions preview (for any selected profile) */}
      {selected && (
        <details className="group" open={showPreview} onToggle={(e) => setShowPreview((e.target as HTMLDetailsElement).open)}>
          <summary className="text-[11px] text-indigo-400 cursor-pointer hover:text-indigo-300 select-none list-none flex items-center gap-1">
            <span className="group-open:hidden">▶ Voir les instructions injectées dans le prompt</span>
            <span className="hidden group-open:inline">▼ Masquer</span>
          </summary>
          <div className="mt-2 bg-slate-900/80 border border-slate-700/60 rounded-lg p-3 space-y-3">
            {(['analyze', 'structure', 'content'] as const).map((phase) => (
              <div key={phase}>
                <div className="text-[10px] font-mono text-slate-500 mb-0.5 uppercase tracking-wide">
                  {phase === 'analyze' ? 'Phase A — Analyse documentaire' : phase === 'structure' ? 'Phase B — Structure mindmap' : 'Phase 2 — Génération des contenus'}
                </div>
                <pre className="text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed font-mono">
                  {buildPedagogicalInstructions(selected, phase)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function ScenarizationModal({ onClose }: Props) {
  const { replaceContent, setProjectName, updateNode, nodes: storeNodes, edges: storeEdges } = useMindmapStore();

  // Setup state
  const [files, setFiles] = useState<ScenarizationFile[]>([]);
  const [level, setLevel] = useState('Lycée');
  const [duration, setDuration] = useState('');
  const [moduleCount, setModuleCount] = useState(4);
  const [language, setLanguage] = useState('Français');
  const [additionalContext, setAdditionalContext] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<ScenarizationProfile | null>(null);

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
  const [contentProgress, setContentProgress] = useState({ done: 0, total: 0 });
  const [contentTasks, setContentTasks] = useState<ContentTaskParams[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  // Map of nodeId → name for nodes currently being generated (concurrent)
  const [activeNodes, setActiveNodes] = useState<Map<string, string>>(new Map());
  // Nodes that failed during content generation — used to offer retry
  const [failedNodes, setFailedNodes] = useState<{ nodeId: string; name: string; subtype: string }[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── Pedagogical profile injection helpers ────────────────────────────────
  // Prepends profile instructions to the user's free text, per phase
  const effectiveContext = (phase: 'analyze' | 'structure') => {
    const profile = selectedProfile ? buildPedagogicalInstructions(selectedProfile, phase) : '';
    const user = additionalContext.trim();
    return [profile, user].filter(Boolean).join('\n\n') || undefined;
  };

  const effectiveContentText = () => {
    const profile = selectedProfile ? buildPedagogicalInstructions(selectedProfile, 'content') : '';
    const user = contentAdditionalText.trim();
    return [profile, user].filter(Boolean).join('\n\n') || undefined;
  };

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
        { files, level, duration, moduleCount, language, additionalContext: effectiveContext('analyze') },
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
        { courseDocument, level, duration, moduleCount, language, additionalContext: effectiveContext('structure') },
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

  // Whether content_setup was reached directly from setup (vs from applied after scénarisation)
  const contentSetupFromSetup = useRef(false);

  // Direct entry point: generate content for the current mindmap (no need to re-run scénarisation)
  const handleContentSetupDirect = () => {
    const tasks = buildContentTasks(storeNodes, storeEdges);
    if (tasks.length === 0) return;
    setContentTasks(tasks);
    setSelectedNodeIds(new Set(tasks.map(t => t.nodeId)));
    setContentFiles([]);
    setContentAdditionalText('');
    setError('');
    contentSetupFromSetup.current = true;
    setStep('content_setup');
  };

  const handleApply = () => {
    if (!result) return;
    replaceContent(result.nodes, result.edges);
    if (result.meta.courseName) setProjectName(result.meta.courseName);
    const tasks = buildContentTasks(result.nodes, result.edges);
    setContentTasks(tasks);
    setSelectedNodeIds(new Set(tasks.map(t => t.nodeId)));
    setApplied(true);
    contentSetupFromSetup.current = false;
    setStep('applied');
  };

  const handleGenerateContent = async () => {
    if (!result) return;
    const allTasks = contentTasks.length > 0 ? contentTasks : buildContentTasks(result.nodes, result.edges);
    const tasks = allTasks.filter(t => selectedNodeIds.has(t.nodeId));
    if (tasks.length === 0) return;

    setStep('content_generating');
    setError('');
    setActiveNodes(new Map());
    setFailedNodes([]);
    setContentProgress({ done: 0, total: tasks.length });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await scenarizeContent(
        tasks,
        language,
        (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === 'node_start') {
            const nodeId = d.nodeId as string;
            const name = (d.name as string) ?? '';
            setActiveNodes(prev => new Map(prev).set(nodeId, name));
          } else if (event === 'node_done') {
            const nodeId = d.nodeId as string;
            const nodeType = d.type as string;
            if (nodeType === 'book' && d.content) {
              try { updateNode(nodeId, { chapters: JSON.parse(d.content as string) }); } catch { /* ignore */ }
            } else if (nodeType === 'lesson' && d.content) {
              try { updateNode(nodeId, { pages: JSON.parse(d.content as string) }); } catch { /* ignore */ }
            } else if (d.content !== undefined) {
              updateNode(nodeId, { content: d.content as string });
            }
            if (d.questions !== undefined) updateNode(nodeId, { questions: d.questions as QuizQuestion[] });
            setActiveNodes(prev => { const m = new Map(prev); m.delete(nodeId); return m; });
            setContentProgress(prev => ({ ...prev, done: prev.done + 1 }));
          } else if (event === 'node_error') {
            const nodeId = d.nodeId as string;
            setActiveNodes(prev => { const m = new Map(prev); m.delete(nodeId); return m; });
            setContentProgress(prev => ({ ...prev, done: prev.done + 1 }));
            setFailedNodes(prev => [...prev, {
              nodeId,
              name: (d.name as string) ?? nodeId,
              subtype: tasks.find(t => t.nodeId === nodeId)?.subtype ?? 'page',
            }]);
          } else if (event === 'done') {
            setStep('content_done');
          } else if (event === 'error') {
            setError((d.message as string) ?? 'Erreur inconnue');
            setStep('content_setup');
          }
        },
        controller.signal,
        contentFiles,
        effectiveContentText(),
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
  const existingContentTasks = buildContentTasks(storeNodes, storeEdges);

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
              <ProfileSelector selected={selectedProfile} onSelect={setSelectedProfile} />

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Instructions complémentaires <span className="text-slate-500 font-normal">(optionnel — s'ajoute au profil)</span>
                </label>
                <textarea value={additionalContext} onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Focus sur les exercices pratiques, inclure des parcours conditionnels…"
                  rows={2}
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

              {existingContentTasks.length > 0 && (
                <div className="border-t border-slate-700/60 pt-4 space-y-2">
                  <p className="text-xs text-slate-500 text-center">
                    Le mindmap actuel contient {existingContentTasks.length} nœud{existingContentTasks.length > 1 ? 's' : ''} à enrichir
                  </p>
                  <button
                    onClick={handleContentSetupDirect}
                    className="w-full py-2.5 rounded-xl border border-indigo-500/40 hover:border-indigo-400 hover:bg-indigo-500/10 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    📝 Générer les contenus du mindmap actuel
                  </button>
                </div>
              )}
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

              {/* Node selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">
                    Nœuds à générer <span className="text-slate-500 font-normal">({selectedNodeIds.size} / {contentTasks.length} sélectionnés)</span>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedNodeIds(new Set(contentTasks.map(t => t.nodeId)))}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Tout</button>
                    <span className="text-slate-600">·</span>
                    <button onClick={() => setSelectedNodeIds(new Set())}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Aucun</button>
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-2 max-h-44 overflow-y-auto space-y-0.5">
                  {contentTasks.map((t) => {
                    const checked = selectedNodeIds.has(t.nodeId);
                    return (
                      <label key={t.nodeId}
                        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors
                          ${checked ? 'bg-indigo-500/10' : 'hover:bg-slate-700/50'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            setSelectedNodeIds(prev => {
                              const next = new Set(prev);
                              if (next.has(t.nodeId)) next.delete(t.nodeId);
                              else next.add(t.nodeId);
                              return next;
                            });
                          }}
                          className="w-3.5 h-3.5 rounded accent-indigo-500 flex-shrink-0" />
                        <span className="text-sm">{t.subtype === 'page' ? '📄' : '❓'}</span>
                        <span className={`text-xs truncate ${checked ? 'text-slate-200' : 'text-slate-500'}`}>{t.name}</span>
                        <span className="ml-auto text-xs text-slate-600 flex-shrink-0">{t.subtype}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Active profile indicator */}
              {selectedProfile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/8 border border-indigo-500/20 rounded-lg">
                  <span className="text-base leading-none">{selectedProfile.icon}</span>
                  <div className="min-w-0">
                    <span className="text-xs text-indigo-300 font-medium">{selectedProfile.name}</span>
                    <span className="text-xs text-slate-500 ml-1.5">— profil actif pour la génération</span>
                  </div>
                  <button onClick={() => setSelectedProfile(null)}
                    className="ml-auto text-slate-600 hover:text-slate-400 text-sm flex-shrink-0">✕</button>
                </div>
              )}

              {/* Files */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Documents sources <span className="text-slate-500 font-normal">(optionnel — max 3 fichiers)</span>
                </label>
                <FileDropZone
                  files={contentFiles}
                  onAdd={(f) => setContentFiles(prev => [...prev, ...f].slice(0, 3))}
                  onRemove={(idx) => setContentFiles(prev => prev.filter((_, i) => i !== idx))}
                />
              </div>

              {/* Additional text */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Contexte additionnel <span className="text-slate-500 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={contentAdditionalText}
                  onChange={(e) => setContentAdditionalText(e.target.value)}
                  placeholder="Instructions spécifiques, terminologie, niveau de détail…"
                  rows={2}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">{error}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => { setStep(contentSetupFromSetup.current ? 'setup' : 'applied'); setError(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
                  ← Retour
                </button>
                <button
                  onClick={() => void handleGenerateContent()}
                  disabled={selectedNodeIds.size === 0}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  ✨ Générer ({selectedNodeIds.size})
                </button>
              </div>
            </div>
          )}

          {/* CONTENT GENERATING */}
          {step === 'content_generating' && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-4 h-4 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs text-indigo-400 font-medium uppercase tracking-wide">Génération des contenus</div>
                  <div className="text-sm text-slate-400">
                    {contentProgress.done} / {contentProgress.total} nœuds terminés
                  </div>
                </div>
              </div>

              {contentProgress.total > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{contentProgress.done} / {contentProgress.total}</span>
                    <span>{Math.round((contentProgress.done / contentProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((contentProgress.done / contentProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {activeNodes.size > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-1.5">
                  <div className="text-xs text-slate-500 mb-0.5">En cours ({activeNodes.size} en parallèle)</div>
                  {Array.from(activeNodes.entries()).map(([nodeId, name]) => (
                    <div key={nodeId} className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="w-2.5 h-2.5 border border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handleCancel} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Annuler
              </button>
            </div>
          )}

          {/* CONTENT DONE */}
          {step === 'content_done' && (
            <div className="py-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-3xl">{failedNodes.length === 0 ? '🎉' : '⚠️'}</div>
                <div className={`text-sm font-medium ${failedNodes.length === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {failedNodes.length === 0
                    ? 'Tous les contenus ont été générés !'
                    : `${contentProgress.total - failedNodes.length} / ${contentProgress.total} nœuds générés`}
                </div>
              </div>

              {failedNodes.length > 0 && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-medium text-red-400">
                    {failedNodes.length} nœud{failedNodes.length > 1 ? 's' : ''} non généré{failedNodes.length > 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {failedNodes.map((n) => (
                      <div key={n.nodeId} className="flex items-center gap-2 text-xs text-red-300/80">
                        <span>{n.subtype === 'page' ? '📄' : '❓'}</span>
                        <span className="truncate">{n.name}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedNodeIds(new Set(failedNodes.map(n => n.nodeId)));
                      contentSetupFromSetup.current = true;
                      setStep('content_setup');
                      setError('');
                    }}
                    className="w-full mt-1 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs text-red-300 font-medium transition-colors"
                  >
                    ↺ Relancer les {failedNodes.length} nœuds échoués
                  </button>
                </div>
              )}

              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold transition-colors">
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
