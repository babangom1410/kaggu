import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MindmapNode, QuizQuestion, QuizQuestionType } from '@/types/mindmap.types';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizEditorModalProps {
  quizName: string;
  data: Record<string, unknown>;
  nodes: MindmapNode[];
  currentNodeId: string;
  onUpdate: (key: string, value: unknown) => void;
  onClose: () => void;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function genId() {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const inputCls =
  'w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 ' +
  'focus:border-indigo-500 focus:outline-none placeholder:text-slate-500';

const TYPE_LABELS: Record<string, string> = {
  multichoice: 'QCM',
  truefalse: 'Vrai/Faux',
  shortanswer: 'Réponse courte',
  numerical: 'Numérique',
};

// ─── QuestionCard ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: QuizQuestion;
  index: number;
  total: number;
  onChange: (q: QuizQuestion) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function QuestionCard({ question, index, total, onChange, onDelete, onMoveUp, onMoveDown }: QuestionCardProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col gap-px flex-shrink-0">
          <button onClick={onMoveUp} disabled={index === 0}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▲</button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▼</button>
        </div>
        <span className="text-[10px] font-bold text-slate-500 flex-shrink-0 w-5">{index + 1}.</span>
        <span className="text-[10px] font-semibold bg-slate-700 text-slate-400 px-2 py-0.5 rounded flex-shrink-0">
          {TYPE_LABELS[question.type] ?? question.type}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <span
            className="text-sm text-slate-300 line-clamp-1 block"
            dangerouslySetInnerHTML={{ __html: question.text || '<span style="color:#475569">Énoncé…</span>' }}
          />
        </button>
        <span className="text-xs text-slate-500 flex-shrink-0">{question.points} pt</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`text-slate-500 hover:text-slate-300 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button onClick={onDelete} className="text-slate-600 hover:text-red-400 text-sm flex-shrink-0 transition-colors">✕</button>
      </div>

      {/* Expanded editor */}
      {open && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-700/50 space-y-3">
          {/* Type selector */}
          <div className="flex gap-1 pt-3">
            {(['multichoice', 'truefalse', 'shortanswer', 'numerical'] as QuizQuestionType[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (t === question.type) return;
                  if (t === 'multichoice')
                    onChange({ ...question, type: 'multichoice', single: true, answers: [{ id: genId(), text: '', correct: true, feedback: '' }, { id: genId(), text: '', correct: false, feedback: '' }] } as QuizQuestion);
                  else if (t === 'truefalse')
                    onChange({ ...question, type: 'truefalse', correct: true } as QuizQuestion);
                  else if (t === 'shortanswer')
                    onChange({ ...question, type: 'shortanswer', answers: [{ id: genId(), text: '', feedback: '' }] } as QuizQuestion);
                  else
                    onChange({ ...question, type: 'numerical', answer: 0, tolerance: 0 } as QuizQuestion);
                }}
                className={`flex-1 py-1 text-xs rounded transition-colors ${
                  question.type === t ? 'bg-indigo-500 text-white font-semibold' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Énoncé + points */}
          <div className="flex gap-2 items-start">
            <textarea
              value={question.text}
              onChange={(e) => onChange({ ...question, text: e.target.value })}
              placeholder="Énoncé de la question…"
              rows={2}
              className={`${inputCls} flex-1 resize-none text-sm`}
            />
            <div className="flex-shrink-0 w-16">
              <label className="block text-[10px] text-slate-500 mb-1 text-center">Points</label>
              <input
                type="number" min={0.5} step={0.5} value={question.points}
                onChange={(e) => onChange({ ...question, points: Number(e.target.value) })}
                className={`${inputCls} text-center`}
              />
            </div>
          </div>

          {/* Type-specific editors */}
          {question.type === 'multichoice' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox" checked={!question.single}
                    onChange={(e) => onChange({ ...question, single: !e.target.checked })}
                    className="accent-indigo-500"
                  />
                  Plusieurs bonnes réponses
                </label>
                <button
                  onClick={() => onChange({ ...question, answers: [...question.answers, { id: genId(), text: '', correct: false, feedback: '' }] })}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Ajouter une réponse
                </button>
              </div>
              {question.answers.map((ans, ai) => (
                <div key={ans.id} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const updated = question.answers.map((a, i) =>
                        question.single ? { ...a, correct: i === ai } : i === ai ? { ...a, correct: !a.correct } : a
                      );
                      onChange({ ...question, answers: updated });
                    }}
                    title={ans.correct ? 'Correcte' : 'Incorrecte'}
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
                      ans.correct ? 'bg-emerald-500 border-emerald-400' : 'border-slate-500 hover:border-slate-300'
                    }`}
                  />
                  <input
                    type="text" value={ans.text}
                    onChange={(e) => onChange({ ...question, answers: question.answers.map((a, i) => i === ai ? { ...a, text: e.target.value } : a) })}
                    placeholder={`Option ${ai + 1}…`}
                    className={`${inputCls} flex-1 text-sm`}
                  />
                  <button
                    onClick={() => onChange({ ...question, answers: question.answers.filter((_, i) => i !== ai) })}
                    disabled={question.answers.length <= 2}
                    className="text-slate-600 hover:text-red-400 disabled:opacity-20 transition-colors"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {question.type === 'truefalse' && (
            <div className="flex gap-3">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  onClick={() => onChange({ ...question, correct: val })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    question.correct === val
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {val ? '✓ Vrai' : '✕ Faux'}
                </button>
              ))}
            </div>
          )}

          {question.type === 'shortanswer' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Réponses acceptées</span>
                <button
                  onClick={() => onChange({ ...question, answers: [...question.answers, { id: genId(), text: '', feedback: '' }] })}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >+ Ajouter</button>
              </div>
              {question.answers.map((ans, ai) => (
                <div key={ans.id} className="flex items-center gap-2">
                  <input
                    type="text" value={ans.text}
                    onChange={(e) => onChange({ ...question, answers: question.answers.map((a, i) => i === ai ? { ...a, text: e.target.value } : a) })}
                    placeholder="Réponse acceptée…"
                    className={`${inputCls} flex-1 text-sm`}
                  />
                  <button
                    onClick={() => onChange({ ...question, answers: question.answers.filter((_, i) => i !== ai) })}
                    disabled={question.answers.length <= 1}
                    className="text-slate-600 hover:text-red-400 disabled:opacity-20 transition-colors"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {question.type === 'numerical' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Réponse exacte</label>
                <input
                  type="number" value={question.answer}
                  onChange={(e) => onChange({ ...question, answer: Number(e.target.value) })}
                  className={`${inputCls} text-sm`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Tolérance ±</label>
                <input
                  type="number" min={0} step={0.1} value={question.tolerance}
                  onChange={(e) => onChange({ ...question, tolerance: Number(e.target.value) })}
                  className={`${inputCls} text-sm`}
                />
              </div>
            </div>
          )}

          {/* General feedback */}
          <input
            type="text"
            value={question.generalfeedback ?? ''}
            onChange={(e) => onChange({ ...question, generalfeedback: e.target.value })}
            placeholder="Feedback général (optionnel)…"
            className={`${inputCls} text-sm`}
          />
        </div>
      )}
    </div>
  );
}

// ─── AI Panel ─────────────────────────────────────────────────────────────────

interface AiPanelProps {
  quizName: string;
  nodes: MindmapNode[];
  currentNodeId: string;
  onInsert: (questions: QuizQuestion[]) => void;
}

function AiPanel({ quizName, nodes, currentNodeId, onInsert }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState<QuizQuestionType[]>(['multichoice']);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState('');

  const ALL_TYPES: { value: QuizQuestionType; label: string }[] = [
    { value: 'multichoice',  label: 'QCM' },
    { value: 'truefalse',    label: 'V/F' },
    { value: 'shortanswer',  label: 'Courte' },
    { value: 'numerical',    label: 'Num.' },
  ];

  const contentSources = nodes.filter((n) => {
    if (n.id === currentNodeId) return false;
    const d = n.data as unknown as Record<string, unknown>;
    if (n.type === 'resource') return d.subtype === 'page' || d.subtype === 'book';
    if (n.type === 'section') return Boolean(d.summary);
    return false;
  });

  const nodeLabel = (n: MindmapNode) => {
    const d = n.data as unknown as Record<string, unknown>;
    return String(d.name ?? d.fullname ?? n.id);
  };

  const extractContent = (n: MindmapNode): string => {
    const d = n.data as unknown as Record<string, unknown>;
    if (n.type === 'section') return String(d.summary ?? '');
    if (d.subtype === 'page') return String(d.content ?? '');
    if (d.subtype === 'book') {
      const chs = (d.chapters ?? []) as Array<{ title: string; content: string }>;
      return chs.map((c) => `## ${c.title}\n${c.content}`).join('\n\n');
    }
    return '';
  };

  const toggleType = (t: QuizQuestionType) => {
    setTypes((prev) => prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const courseContent = contentSources
        .filter((n) => selectedSources.has(n.id))
        .map((n) => ({ nodeId: n.id, label: nodeLabel(n), content: extractContent(n) }));

      const res = await fetch(`${API_BASE}/v1/llm/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ quizName, prompt, questionCount: count, questionTypes: types, courseContent }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const body = await res.json() as { data: QuizQuestion[] };
      setPreview(body.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
        <span>✨</span> Générer par IA
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Consigne</label>
        <textarea
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="ex. 5 questions sur les notions clés, niveau M1…"
          rows={4}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700
                     focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none"
        />
      </div>

      {/* Count */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nb de questions</label>
        <input
          type="number" min={1} max={50} value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value))))}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Types */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Types</label>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TYPES.map(({ value, label }) => (
            <button
              key={value} onClick={() => toggleType(value)}
              className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                types.includes(value)
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Sources */}
      {contentSources.length > 0 && (
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Contenus sources {selectedSources.size > 0 ? `(${selectedSources.size})` : ''}
          </label>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {contentSources.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedSources((prev) => { const s = new Set(prev); s.has(n.id) ? s.delete(n.id) : s.add(n.id); return s; })}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                  selectedSources.has(n.id)
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{selectedSources.has(n.id) ? '☑' : '☐'}</span>
                <span className="truncate">{nodeLabel(n)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Aperçu — {preview.length} question{preview.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {preview.map((q, i) => (
              <div key={q.id ?? i} className="bg-slate-800 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                    {TYPE_LABELS[q.type] ?? q.type}
                  </span>
                  <span className="text-[10px] text-slate-500">{q.points} pt</span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2" dangerouslySetInnerHTML={{ __html: q.text }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500
                     text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Génération en cours…' : '✨ Générer'}
        </button>
        {preview && preview.length > 0 && (
          <button
            onClick={() => { onInsert(preview); setPreview(null); setPrompt(''); }}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500
                       text-white transition-colors"
          >
            Insérer {preview.length} question{preview.length > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── QuizEditorModal ──────────────────────────────────────────────────────────

export function QuizEditorModal({
  quizName,
  data,
  nodes,
  currentNodeId,
  onUpdate,
  onClose,
}: QuizEditorModalProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const questions = (data.questions ?? []) as QuizQuestion[];

  const updateQuestions = (qs: QuizQuestion[]) => onUpdate('questions', qs);

  const addQuestion = () => {
    const q: QuizQuestion = {
      id: genId(), type: 'multichoice', text: '', points: 1, single: true,
      answers: [
        { id: genId(), text: '', correct: true,  feedback: '' },
        { id: genId(), text: '', correct: false, feedback: '' },
      ],
    };
    updateQuestions([...questions, q]);
  };

  const GRADE_MAP = [
    { value: 'highest', label: 'Note la plus haute' },
    { value: 'average', label: 'Moyenne' },
    { value: 'first',   label: 'Première tentative' },
    { value: 'last',    label: 'Dernière tentative' },
  ];

  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700/60 bg-slate-900 flex-shrink-0">
        {/* Icon + title */}
        <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-base">❓</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-200 truncate">{quizName}</div>
          <div className="text-[11px] text-slate-500">
            {questions.length} question{questions.length !== 1 ? 's' : ''}
            {totalPoints > 0 && ` · ${totalPoints} pt${totalPoints !== 1 ? 's' : ''} au total`}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              settingsOpen
                ? 'bg-slate-600 text-slate-200'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
            }`}
          >
            ⚙ Paramètres
          </button>
          <button
            onClick={() => setAiOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              aiOpen
                ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'
            }`}
          >
            ✨ IA
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 transition-colors"
          >
            ✕ Fermer
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Settings panel */}
        {settingsOpen && (
          <div className="w-64 flex-shrink-0 border-r border-slate-700/60 overflow-y-auto px-4 py-4 space-y-4">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Paramètres du quiz</div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Tentatives (0 = illimité)</label>
              <input
                type="number" min={0} value={String(data.attempts ?? 0)}
                onChange={(e) => onUpdate('attempts', Number(e.target.value))}
                className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Durée limite (min, 0 = aucune)</label>
              <input
                type="number" min={0}
                value={data.timelimit ? String(Math.round(Number(data.timelimit) / 60)) : ''}
                onChange={(e) => onUpdate('timelimit', Number(e.target.value) * 60)}
                placeholder="Aucune"
                className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Méthode de notation</label>
              <select
                value={String(data.grademethod ?? 'highest')}
                onChange={(e) => onUpdate('grademethod', e.target.value)}
                className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                {GRADE_MAP.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Ouverture</label>
              <input type="datetime-local" value={String(data.timeopen ?? '')}
                onChange={(e) => onUpdate('timeopen', e.target.value)}
                className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none" />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Fermeture</label>
              <input type="datetime-local" value={String(data.timeclose ?? '')}
                onChange={(e) => onUpdate('timeclose', e.target.value)}
                className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none" />
            </div>

            <button
              onClick={() => onUpdate('shuffleanswers', !data.shuffleanswers)}
              className="flex items-center justify-between w-full"
            >
              <span className="text-sm text-slate-300">Mélanger les réponses</span>
              <div className={`relative w-9 h-5 rounded-full transition-colors ${data.shuffleanswers ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${data.shuffleanswers ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>
        )}

        {/* Questions list */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Subheader */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700/40 flex-shrink-0">
            <span className="text-sm font-semibold text-slate-300">
              Questions
              {questions.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {questions.length} · {totalPoints} pt{totalPoints !== 1 ? 's' : ''}
                </span>
              )}
            </span>
            <button
              onClick={addQuestion}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                         bg-amber-500/10 text-amber-400 border border-amber-500/20
                         hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
            >
              + Ajouter une question
            </button>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                <span className="text-4xl">❓</span>
                <p className="text-sm">Aucune question — ajoutez-en manuellement ou générez-en avec l'IA</p>
                <div className="flex gap-3">
                  <button onClick={addQuestion}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors">
                    + Ajouter manuellement
                  </button>
                  <button onClick={() => setAiOpen(true)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                    ✨ Générer par IA
                  </button>
                </div>
              </div>
            ) : (
              questions.map((q, idx) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={idx}
                  total={questions.length}
                  onChange={(nq) => updateQuestions(questions.map((x, i) => i === idx ? nq : x))}
                  onDelete={() => updateQuestions(questions.filter((_, i) => i !== idx))}
                  onMoveUp={() => { const a = [...questions]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; updateQuestions(a); }}
                  onMoveDown={() => { const a = [...questions]; [a[idx+1], a[idx]] = [a[idx], a[idx+1]]; updateQuestions(a); }}
                />
              ))
            )}
          </div>
        </div>

        {/* AI panel */}
        {aiOpen && (
          <div className="w-72 flex-shrink-0 border-l border-slate-700/60 overflow-y-auto">
            <AiPanel
              quizName={quizName}
              nodes={nodes}
              currentNodeId={currentNodeId}
              onInsert={(generated) => updateQuestions([...questions, ...generated])}
            />
          </div>
        )}
      </div>
    </div>
  );
}
