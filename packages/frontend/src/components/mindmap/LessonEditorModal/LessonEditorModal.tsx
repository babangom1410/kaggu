import { useState } from 'react';
import { PageEditorModal } from '@/components/mindmap/PageEditorModal';
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

// ─── LessonEditorModal ────────────────────────────────────────────────────────

export function LessonEditorModal({ lessonName, data, onUpdate, onClose }: LessonEditorModalProps) {
  const pages = (data.pages ?? []) as LessonPage[];
  const [editingContentIdx, setEditingContentIdx] = useState<number | null>(null);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-200">
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

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center text-base">📖</div>
          <div>
            <div className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">Éditeur de leçon</div>
            <div className="text-sm font-semibold text-slate-200">{lessonName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {pages.length} page{pages.length !== 1 ? 's' : ''}
          </span>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400
                       hover:bg-slate-800 hover:text-slate-200 transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {pages.length === 0 && (
            <div className="text-center py-16 text-slate-600">
              <div className="text-4xl mb-3">📖</div>
              <p className="text-sm">Aucune page — ajoutez-en une ci-dessous</p>
            </div>
          )}

          {pages.map((page, i) => (
            <PageCard
              key={page.id}
              page={page}
              index={i}
              total={pages.length}
              onChange={(p) => updatePage(i, p)}
              onDelete={() => deletePage(i)}
              onMoveUp={() => movePage(i, -1)}
              onMoveDown={() => movePage(i, 1)}
              onEditContent={() => setEditingContentIdx(i)}
            />
          ))}

          {/* Add page buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {(Object.keys(PAGE_TYPE_LABELS) as LessonPageType[]).map((t) => (
              <button key={t} onClick={() => addPage(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-slate-800 text-slate-400 border border-slate-700
                           hover:border-indigo-500/50 hover:text-slate-200 transition-colors">
                + {PAGE_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
