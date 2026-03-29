import { useState } from 'react';
import { PageEditorModal } from '@/components/mindmap/PageEditorModal';
import { generateBook } from '@/api/llm-api';
import type { BookChapter } from '@/types/mindmap.types';

interface BookEditorModalProps {
  bookName: string;
  data: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  onClose: () => void;
}

function genId() {
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const inputCls =
  'w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 ' +
  'focus:border-indigo-500 focus:outline-none placeholder:text-slate-500';

// ─── ChapterCard ──────────────────────────────────────────────────────────────

interface ChapterCardProps {
  chapter: BookChapter;
  index: number;
  total: number;
  onChange: (c: BookChapter) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEditContent: () => void;
}

function ChapterCard({ chapter, index, total, onChange, onDelete, onMoveUp, onMoveDown, onEditContent }: ChapterCardProps) {
  const contentPreview = chapter.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  return (
    <div className={`bg-slate-800 rounded-xl border ${chapter.subchapter ? 'border-slate-700/50 ml-6' : 'border-slate-700'}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col gap-px flex-shrink-0">
          <button onClick={onMoveUp} disabled={index === 0}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▲</button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▼</button>
        </div>

        {/* Subchapter toggle */}
        <button
          onClick={() => onChange({ ...chapter, subchapter: !chapter.subchapter })}
          title={chapter.subchapter ? 'Sous-chapitre → Chapitre principal' : 'Chapitre principal → Sous-chapitre'}
          className={`text-[10px] rounded px-1.5 py-0.5 flex-shrink-0 font-mono transition-colors ${
            chapter.subchapter ? 'bg-slate-700 text-slate-500' : 'bg-slate-600 text-slate-200'
          }`}
        >
          {chapter.subchapter ? '↳' : '■'}
        </button>

        {/* Title input */}
        <input
          type="text" value={chapter.title}
          onChange={(e) => onChange({ ...chapter, title: e.target.value })}
          placeholder="Titre du chapitre…"
          className="flex-1 min-w-0 bg-transparent text-slate-200 text-sm focus:outline-none placeholder:text-slate-600"
        />

        {/* Edit content button */}
        <button onClick={onEditContent}
          title="Rédiger le contenu"
          className={`text-sm flex-shrink-0 transition-colors ${chapter.content ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'}`}>
          📝
        </button>

        <button onClick={onDelete}
          className="text-slate-600 hover:text-red-400 text-xs transition-colors flex-shrink-0">✕</button>
      </div>

      {/* Content preview */}
      {contentPreview && (
        <button onClick={onEditContent}
          className="w-full px-3 pb-2.5 text-left">
          <p className="text-xs text-slate-500 line-clamp-2 pl-10">{contentPreview}{chapter.content.length > 80 ? '…' : ''}</p>
        </button>
      )}
    </div>
  );
}

// ─── AI Panel ─────────────────────────────────────────────────────────────────

interface AiPanelProps {
  bookName: string;
  onInsert: (chapters: BookChapter[]) => void;
}

function AiPanel({ bookName, onInsert }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(6);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<BookChapter[] | null>(null);
  const [error, setError] = useState('');

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const raw = await generateBook(bookName, prompt, count);
      setPreview(raw as BookChapter[]);
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
          placeholder="ex. Livre sur l'introduction à la programmation Python, avec chapitres et sous-sections pour lycéens…"
          rows={4}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700
                     focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none"
        />
      </div>

      {/* Count */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nb de chapitres</label>
        <input
          type="number" min={1} max={20} value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value))))}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Aperçu — {preview.length} chapitre{preview.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {preview.map((c, i) => (
              <div key={c.id ?? i}
                className={`flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 ${c.subchapter ? 'ml-3' : ''}`}>
                <span className={`text-[9px] font-mono ${c.subchapter ? 'text-slate-500' : 'text-amber-400'}`}>
                  {c.subchapter ? '↳' : '■'}
                </span>
                <span className="line-clamp-1">{c.title || '—'}</span>
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
            Insérer {preview.length} chapitre{preview.length > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── BookEditorModal ──────────────────────────────────────────────────────────

export function BookEditorModal({ bookName, data, onUpdate, onClose }: BookEditorModalProps) {
  const chapters = (data.chapters ?? []) as BookChapter[];
  const [editingChapterIdx, setEditingChapterIdx] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const setChapters = (updated: BookChapter[]) => onUpdate('chapters', updated);

  const addChapter = (subchapter = false) => {
    setChapters([...chapters, { id: genId(), title: '', content: '', subchapter }]);
  };

  const updateChapter = (i: number, updated: BookChapter) => {
    setChapters(chapters.map((c, idx) => idx === i ? updated : c));
  };

  const deleteChapter = (i: number) => {
    setChapters(chapters.filter((_, idx) => idx !== i));
    if (editingChapterIdx === i) setEditingChapterIdx(null);
  };

  const moveChapter = (i: number, dir: -1 | 1) => {
    const a = [...chapters];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    setChapters(a);
  };

  const editingChapter = editingChapterIdx !== null ? chapters[editingChapterIdx] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Chapter content editor overlay */}
      {editingChapter !== null && editingChapterIdx !== null && (
        <PageEditorModal
          title={editingChapter.title || `Chapitre ${editingChapterIdx + 1}`}
          label={editingChapter.subchapter ? 'Sous-chapitre' : 'Chapitre'}
          content={editingChapter.content}
          onSave={(html) => {
            updateChapter(editingChapterIdx, { ...editingChapter, content: html });
            setEditingChapterIdx(null);
          }}
          onClose={() => setEditingChapterIdx(null)}
        />
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700/60 bg-slate-900 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-base">📚</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-200 truncate">{bookName}</div>
          <div className="text-[11px] text-slate-500">
            {chapters.length} chapitre{chapters.length !== 1 ? 's' : ''}
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

        {/* Chapters list */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Subheader */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700/40 flex-shrink-0">
            <span className="text-sm font-semibold text-slate-300">
              Chapitres
              {chapters.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">{chapters.length}</span>
              )}
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => addChapter(false)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                           bg-slate-800 text-slate-400 border border-slate-700
                           hover:border-amber-500/50 hover:text-slate-200 transition-colors">
                ■ Chapitre
              </button>
              <button onClick={() => addChapter(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                           bg-slate-800 text-slate-400 border border-slate-700
                           hover:border-amber-500/50 hover:text-slate-200 transition-colors">
                ↳ Sous-chapitre
              </button>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {chapters.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                <span className="text-4xl">📚</span>
                <p className="text-sm">Aucun chapitre — ajoutez-en manuellement ou générez-en avec l'IA</p>
                <div className="flex gap-3">
                  <button onClick={() => addChapter(false)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors">
                    + Chapitre
                  </button>
                  <button onClick={() => setAiOpen(true)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                    ✨ Générer par IA
                  </button>
                </div>
              </div>
            ) : (
              chapters.map((chapter, idx) => (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  index={idx}
                  total={chapters.length}
                  onChange={(c) => updateChapter(idx, c)}
                  onDelete={() => deleteChapter(idx)}
                  onMoveUp={() => moveChapter(idx, -1)}
                  onMoveDown={() => moveChapter(idx, 1)}
                  onEditContent={() => setEditingChapterIdx(idx)}
                />
              ))
            )}
          </div>
        </div>

        {/* AI panel */}
        {aiOpen && (
          <div className="w-72 flex-shrink-0 border-l border-slate-700/60 overflow-y-auto">
            <AiPanel
              bookName={bookName}
              onInsert={(generated) => setChapters([...chapters, ...generated])}
            />
          </div>
        )}
      </div>
    </div>
  );
}
