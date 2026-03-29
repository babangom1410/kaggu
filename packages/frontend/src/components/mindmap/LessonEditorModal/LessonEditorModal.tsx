import { useState } from 'react';
import { PageEditorModal } from '@/components/mindmap/PageEditorModal';
import { generateLesson } from '@/api/llm-api';
import type { LessonPage, LessonPageAnswer, LessonPageType } from '@/types/mindmap.types';

interface LessonEditorModalProps {
  lessonName: string;
  data: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  onClose: () => void;
}

function genId() {
  return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const inputCls =
  'w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 ' +
  'focus:border-indigo-500 focus:outline-none placeholder:text-slate-500';

const PAGE_TYPE_LABELS: Record<LessonPageType, string> = {
  content: 'Contenu',
  multichoice: 'QCM',
  truefalse: 'Vrai/Faux',
  shortanswer: 'Réponse courte',
};

const JUMPTO_OPTIONS = [
  { value: -1, label: 'Page suivante' },
  { value: -2, label: 'Fin de la leçon' },
  { value: 0, label: 'Cette page' },
];

// ─── PageCard ─────────────────────────────────────────────────────────────────

interface PageCardProps {
  page: LessonPage;
  index: number;
  total: number;
  onChange: (p: LessonPage) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEditContent: () => void;
}

function PageCard({ page, index, total, onChange, onDelete, onMoveUp, onMoveDown, onEditContent }: PageCardProps) {
  const [open, setOpen] = useState(true);

  const answers = page.answers ?? [];

  const addAnswer = () => {
    onChange({
      ...page,
      answers: [...answers, { id: genId(), text: '', response: '', correct: false, jumpto: -1 }],
    });
  };

  const updateAnswer = (i: number, patch: Partial<LessonPageAnswer>) => {
    const updated = answers.map((a, idx) => idx === i ? { ...a, ...patch } : a);
    onChange({ ...page, answers: updated });
  };

  const removeAnswer = (i: number) => {
    onChange({ ...page, answers: answers.filter((_, idx) => idx !== i) });
  };

  const contentPreview = page.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const hasAnswers = page.type !== 'content';

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col gap-px flex-shrink-0">
          <button onClick={onMoveUp} disabled={index === 0}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▲</button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▼</button>
        </div>
        <span className="text-[10px] font-bold text-slate-500 flex-shrink-0 w-5">{index + 1}.</span>
        <span className="text-[10px] font-semibold bg-slate-700 text-slate-400 px-2 py-0.5 rounded flex-shrink-0">
          {PAGE_TYPE_LABELS[page.type]}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <span className="text-sm text-slate-300 line-clamp-1 block">
            {page.title || <span className="text-slate-600">Sans titre…</span>}
          </span>
        </button>
        <button onClick={onDelete}
          className="text-slate-600 hover:text-red-400 text-xs transition-colors flex-shrink-0 ml-1">✕</button>
        <button onClick={() => setOpen((v) => !v)}
          className={`text-slate-500 hover:text-slate-300 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-700/60 pt-3">
          {/* Page type */}
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(PAGE_TYPE_LABELS) as LessonPageType[]).map((t) => (
              <button key={t}
                onClick={() => onChange({ ...page, type: t, answers: t === 'content' ? [] : (answers.length ? answers : [{ id: genId(), text: '', response: '', correct: false, jumpto: -1 }]) })}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors
                  ${page.type === t ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}>
                {PAGE_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Title */}
          <input type="text" value={page.title} placeholder="Titre de la page…"
            onChange={(e) => onChange({ ...page, title: e.target.value })}
            className={inputCls} />

          {/* Content */}
          <button onClick={onEditContent}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50
                       hover:border-amber-500/50 transition-colors text-left group">
            <span className="text-amber-400 text-sm flex-shrink-0">📝</span>
            <div className="flex-1 min-w-0">
              {contentPreview
                ? <span className="text-xs text-slate-400 line-clamp-2">{contentPreview}{page.content.length > 80 ? '…' : ''}</span>
                : <span className="text-xs text-slate-600">Cliquez pour rédiger le contenu HTML…</span>}
            </div>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-slate-500 group-hover:text-amber-400 flex-shrink-0 transition-colors">
              <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Answers */}
          {hasAnswers && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Réponses{answers.length ? ` (${answers.length})` : ''}
                </span>
                {page.type !== 'truefalse' && (
                  <button onClick={addAnswer}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">+ Ajouter</button>
                )}
              </div>

              {page.type === 'truefalse' && (
                <div className="flex gap-2">
                  {['Vrai', 'Faux'].map((label, i) => {
                    const ans = answers[i] ?? { id: genId(), text: label, response: '', correct: i === 0, jumpto: -1 };
                    return (
                      <div key={i} className="flex-1 bg-slate-900/50 rounded-lg p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const a = [...answers];
                              a[0] = { ...(a[0] ?? { id: genId(), text: 'Vrai', response: '', jumpto: -1 }), correct: i === 0 };
                              a[1] = { ...(a[1] ?? { id: genId(), text: 'Faux', response: '', jumpto: -1 }), correct: i === 1 };
                              onChange({ ...page, answers: a });
                            }}
                            className={`w-3 h-3 rounded-full border flex-shrink-0 transition-colors
                              ${ans.correct ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}
                          />
                          <span className="text-xs font-medium text-slate-300">{label}</span>
                        </div>
                        <input type="text" value={ans.response ?? ''} placeholder="Feedback…"
                          onChange={(e) => {
                            const a = [...answers];
                            a[i] = { ...(a[i] ?? { id: genId(), text: label, correct: i === 0, jumpto: -1 }), response: e.target.value };
                            onChange({ ...page, answers: a });
                          }}
                          className={inputCls} />
                      </div>
                    );
                  })}
                </div>
              )}

              {page.type !== 'truefalse' && answers.map((ans, ai) => (
                <div key={ans.id} className="bg-slate-900/50 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {page.type === 'multichoice' && (
                      <button
                        onClick={() => updateAnswer(ai, { correct: !ans.correct })}
                        className={`w-3 h-3 rounded-full border flex-shrink-0 transition-colors
                          ${ans.correct ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-emerald-500'}`}
                        title="Marquer comme correcte"
                      />
                    )}
                    <input type="text" value={ans.text} placeholder="Texte de la réponse…"
                      onChange={(e) => updateAnswer(ai, { text: e.target.value })}
                      className={`${inputCls} flex-1`} />
                    <button onClick={() => removeAnswer(ai)}
                      className="text-slate-600 hover:text-red-400 text-xs transition-colors flex-shrink-0">✕</button>
                  </div>
                  <div className="flex gap-1.5">
                    <input type="text" value={ans.response ?? ''} placeholder="Feedback après réponse…"
                      onChange={(e) => updateAnswer(ai, { response: e.target.value })}
                      className={`${inputCls} flex-1`} />
                    <select value={ans.jumpto}
                      onChange={(e) => updateAnswer(ai, { jumpto: Number(e.target.value) })}
                      className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-1.5 border border-slate-600 focus:border-indigo-500 focus:outline-none flex-shrink-0">
                      {JUMPTO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI Panel ─────────────────────────────────────────────────────────────────

interface AiPanelProps {
  lessonName: string;
  onInsert: (pages: LessonPage[]) => void;
}

function AiPanel({ lessonName, onInsert }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState<LessonPageType[]>(['content', 'multichoice']);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<LessonPage[] | null>(null);
  const [error, setError] = useState('');

  const ALL_TYPES: { value: LessonPageType; label: string }[] = [
    { value: 'content',     label: 'Contenu' },
    { value: 'multichoice', label: 'QCM' },
    { value: 'truefalse',   label: 'V/F' },
    { value: 'shortanswer', label: 'Courte' },
  ];

  const toggleType = (t: LessonPageType) => {
    setTypes((prev) => prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const raw = await generateLesson(lessonName, prompt, count, types);
      setPreview(raw as LessonPage[]);
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
          placeholder="ex. Leçon interactive sur les bases des réseaux TCP/IP, niveau BTS…"
          rows={4}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700
                     focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none"
        />
      </div>

      {/* Count */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nb de pages</label>
        <input
          type="number" min={1} max={30} value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value))))}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Types */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Types de pages</label>
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

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Aperçu — {preview.length} page{preview.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {preview.map((p, i) => (
              <div key={p.id ?? i} className="bg-slate-800 rounded-lg px-3 py-2 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                    {PAGE_TYPE_LABELS[p.type] ?? p.type}
                  </span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-1">{p.title || '—'}</p>
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
            Insérer {preview.length} page{preview.length > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── LessonEditorModal ────────────────────────────────────────────────────────

export function LessonEditorModal({ lessonName, data, onUpdate, onClose }: LessonEditorModalProps) {
  const pages = (data.pages ?? []) as LessonPage[];
  const [editingContentIdx, setEditingContentIdx] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const setPages = (updated: LessonPage[]) => onUpdate('pages', updated);

  const addPage = (type: LessonPageType) => {
    const defaults: Partial<LessonPage> = type === 'content'
      ? { answers: [] }
      : type === 'truefalse'
      ? { answers: [
            { id: genId(), text: 'Vrai', response: '', correct: true, jumpto: -1 },
            { id: genId(), text: 'Faux', response: '', correct: false, jumpto: -1 },
          ] }
      : { answers: [{ id: genId(), text: '', response: '', correct: true, jumpto: -1 }] };

    setPages([...pages, { id: genId(), title: '', content: '', type, ...defaults }]);
  };

  const updatePage = (i: number, updated: LessonPage) => {
    setPages(pages.map((p, idx) => idx === i ? updated : p));
  };

  const deletePage = (i: number) => setPages(pages.filter((_, idx) => idx !== i));

  const movePage = (i: number, dir: -1 | 1) => {
    const a = [...pages];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    setPages(a);
  };

  const editingPage = editingContentIdx !== null ? pages[editingContentIdx] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Page content editor overlay */}
      {editingPage !== null && editingContentIdx !== null && (
        <PageEditorModal
          title={editingPage.title || `Page ${editingContentIdx + 1}`}
          label="Contenu de la page"
          content={editingPage.content}
          onSave={(html) => {
            updatePage(editingContentIdx, { ...editingPage, content: html });
            setEditingContentIdx(null);
          }}
          onClose={() => setEditingContentIdx(null)}
        />
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700/60 bg-slate-900 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-base">📖</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-200 truncate">{lessonName}</div>
          <div className="text-[11px] text-slate-500">
            {pages.length} page{pages.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex items-center gap-2">
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

        {/* Pages list */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Subheader */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700/40 flex-shrink-0">
            <span className="text-sm font-semibold text-slate-300">
              Pages
              {pages.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">{pages.length}</span>
              )}
            </span>
            <div className="flex gap-1.5">
              {(Object.keys(PAGE_TYPE_LABELS) as LessonPageType[]).map((t) => (
                <button key={t} onClick={() => addPage(t)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                             bg-slate-800 text-slate-400 border border-slate-700
                             hover:border-indigo-500/50 hover:text-slate-200 transition-colors">
                  + {PAGE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                <span className="text-4xl">📖</span>
                <p className="text-sm">Aucune page — ajoutez-en manuellement ou générez-en avec l'IA</p>
                <div className="flex gap-3">
                  <button onClick={() => addPage('content')}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors">
                    + Page de contenu
                  </button>
                  <button onClick={() => setAiOpen(true)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                    ✨ Générer par IA
                  </button>
                </div>
              </div>
            ) : (
              pages.map((page, idx) => (
                <PageCard
                  key={page.id}
                  page={page}
                  index={idx}
                  total={pages.length}
                  onChange={(p) => updatePage(idx, p)}
                  onDelete={() => deletePage(idx)}
                  onMoveUp={() => movePage(idx, -1)}
                  onMoveDown={() => movePage(idx, 1)}
                  onEditContent={() => setEditingContentIdx(idx)}
                />
              ))
            )}
          </div>
        </div>

        {/* AI panel */}
        {aiOpen && (
          <div className="w-72 flex-shrink-0 border-l border-slate-700/60 overflow-y-auto">
            <AiPanel
              lessonName={lessonName}
              onInsert={(generated) => setPages([...pages, ...generated])}
            />
          </div>
        )}
      </div>
    </div>
  );
}
