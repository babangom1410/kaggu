import { useState } from 'react';
import type { FeedbackItem, FeedbackItemType } from '@/types/mindmap.types';

interface FeedbackEditorModalProps {
  feedbackName: string;
  data: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  onClose: () => void;
}

function genId() {
  return `fi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const inputCls =
  'w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 ' +
  'focus:border-indigo-500 focus:outline-none placeholder:text-slate-500';

const ITEM_TYPE_LABELS: Record<FeedbackItemType, string> = {
  label: 'Étiquette',
  info: 'Information',
  text: 'Texte court',
  textarea: 'Texte long',
  multichoice: 'Choix multiple',
  multichoice_rated: 'Choix noté',
  numeric: 'Numérique',
  pagebreak: 'Saut de page',
};

const ITEM_TYPE_ICONS: Record<FeedbackItemType, string> = {
  label: '🏷️',
  info: 'ℹ️',
  text: '📝',
  textarea: '📄',
  multichoice: '☑️',
  multichoice_rated: '⭐',
  numeric: '🔢',
  pagebreak: '—',
};

// ─── ItemCard ─────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: FeedbackItem;
  index: number;
  total: number;
  onChange: (item: FeedbackItem) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ItemCard({ item, index, total, onChange, onDelete, onMoveUp, onMoveDown }: ItemCardProps) {
  const [open, setOpen] = useState(true);

  const isStructural = item.type === 'label' || item.type === 'info' || item.type === 'pagebreak';
  const hasOptions = item.type === 'multichoice' || item.type === 'multichoice_rated';
  const hasRange = item.type === 'numeric';

  const options = item.options ?? [];

  const addOption = () => onChange({ ...item, options: [...options, ''] });
  const updateOption = (i: number, val: string) =>
    onChange({ ...item, options: options.map((o, idx) => (idx === i ? val : o)) });
  const removeOption = (i: number) =>
    onChange({ ...item, options: options.filter((_, idx) => idx !== i) });

  if (item.type === 'pagebreak') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl border border-slate-700">
        <div className="flex flex-col gap-px flex-shrink-0">
          <button onClick={onMoveUp} disabled={index === 0}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▲</button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[9px] leading-none">▼</button>
        </div>
        <span className="text-slate-500 text-xs flex-1">— Saut de page —</span>
        <button onClick={onDelete}
          className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
      </div>
    );
  }

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
        <span className="text-sm flex-shrink-0">{ITEM_TYPE_ICONS[item.type]}</span>
        <span className="text-[10px] font-semibold bg-slate-700 text-slate-400 px-2 py-0.5 rounded flex-shrink-0">
          {ITEM_TYPE_LABELS[item.type]}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <span className="text-sm text-slate-300 line-clamp-1 block">
            {item.name || <span className="text-slate-600">Intitulé…</span>}
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
        <div className="px-3 pb-3 space-y-2.5 border-t border-slate-700/60 pt-3">
          {/* Name / question text */}
          <input type="text" value={item.name} placeholder="Intitulé de la question…"
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            className={inputCls} />

          {/* Required toggle */}
          {!isStructural && (
            <button onClick={() => onChange({ ...item, required: !item.required })}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <div className={`w-7 h-4 rounded-full transition-colors ${item.required ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                <div className={`w-3 h-3 bg-white rounded-full mt-0.5 shadow transition-transform ${item.required ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </div>
              Obligatoire
            </button>
          )}

          {/* Options (multichoice) */}
          {hasOptions && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Options{options.length ? ` (${options.length})` : ''}
                </span>
                <button onClick={addOption}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">+ Ajouter</button>
              </div>
              {options.map((opt, oi) => (
                <div key={oi} className="flex gap-1.5">
                  <input type="text" value={opt} placeholder={`Option ${oi + 1}…`}
                    onChange={(e) => updateOption(oi, e.target.value)}
                    className={`${inputCls} flex-1`} />
                  <button onClick={() => removeOption(oi)}
                    className="text-slate-600 hover:text-red-400 text-xs transition-colors flex-shrink-0">✕</button>
                </div>
              ))}
              {options.length === 0 && (
                <p className="text-xs text-slate-600 text-center py-1">Aucune option — cliquez sur + Ajouter</p>
              )}
            </div>
          )}

          {/* Numeric range */}
          {hasRange && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-slate-500 mb-1">Minimum</label>
                <input type="number" value={item.min ?? 0}
                  onChange={(e) => onChange({ ...item, min: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-slate-500 mb-1">Maximum</label>
                <input type="number" value={item.max ?? 100}
                  onChange={(e) => onChange({ ...item, max: Number(e.target.value) })}
                  className={inputCls} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FeedbackEditorModal ──────────────────────────────────────────────────────

const ADDABLE_TYPES: FeedbackItemType[] = [
  'label', 'info', 'text', 'textarea', 'multichoice', 'multichoice_rated', 'numeric', 'pagebreak',
];

export function FeedbackEditorModal({ feedbackName, data, onUpdate, onClose }: FeedbackEditorModalProps) {
  const items = (data.items ?? []) as FeedbackItem[];

  const setItems = (updated: FeedbackItem[]) => onUpdate('items', updated);

  const addItem = (type: FeedbackItemType) => {
    const defaults: Partial<FeedbackItem> =
      type === 'multichoice' || type === 'multichoice_rated' ? { options: [''] } :
      type === 'numeric' ? { min: 0, max: 100 } :
      {};
    setItems([...items, { id: genId(), type, name: '', required: false, ...defaults }]);
  };

  const updateItem = (i: number, updated: FeedbackItem) =>
    setItems(items.map((item, idx) => idx === i ? updated : item));

  const deleteItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const moveItem = (i: number, dir: -1 | 1) => {
    const a = [...items];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    setItems(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-200">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-base">💬</div>
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Éditeur de sondage</div>
            <div className="text-sm font-semibold text-slate-200">{feedbackName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {items.filter((i) => i.type !== 'label' && i.type !== 'info' && i.type !== 'pagebreak').length} question{items.length !== 1 ? 's' : ''}
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
          {items.length === 0 && (
            <div className="text-center py-16 text-slate-600">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm">Aucune question — ajoutez-en une ci-dessous</p>
            </div>
          )}

          {items.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              index={i}
              total={items.length}
              onChange={(updated) => updateItem(i, updated)}
              onDelete={() => deleteItem(i)}
              onMoveUp={() => moveItem(i, -1)}
              onMoveDown={() => moveItem(i, 1)}
            />
          ))}

          {/* Add item buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {ADDABLE_TYPES.map((t) => (
              <button key={t} onClick={() => addItem(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-slate-800 text-slate-400 border border-slate-700
                           hover:border-emerald-500/50 hover:text-slate-200 transition-colors">
                {ITEM_TYPE_ICONS[t]} {ITEM_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
