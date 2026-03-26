import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface PageEditorModalProps {
  title: string;
  label?: string;          // "Description" ou "Contenu" — affiché dans le header
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export function PageEditorModal({ title, label = 'Contenu', content, onSave, onClose }: PageEditorModalProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState('');

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState('');
  const [aiDone, setAiDone] = useState(false);
  const [aiError, setAiError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = content || '';
      updateCount();
    }
    setSourceHtml(content || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCount = () => {
    const text = editorRef.current?.innerText ?? '';
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
  };

  const exec = (cmd: string, value?: string) => {
    if (sourceMode) return;
    editorRef.current?.focus();
    document.execCommand(cmd, false, value ?? undefined);
    updateCount();
  };

  const toggleSourceMode = () => {
    if (!sourceMode) {
      const html = editorRef.current?.innerHTML ?? '';
      setSourceHtml(html);
      setSourceMode(true);
    } else {
      if (editorRef.current) {
        editorRef.current.innerHTML = sourceHtml;
        updateCount();
      }
      setSourceMode(false);
    }
  };

  const handleSave = () => {
    const html = sourceMode ? sourceHtml : (editorRef.current?.innerHTML ?? '');
    onSave(html);
    onClose();
  };

  // ── AI generation ──────────────────────────────────────────────────────────

  const openAi = () => {
    setAiOpen(!aiOpen);
    setAiPreview('');
    setAiDone(false);
    setAiError('');
  };

  const cancelAi = () => {
    abortRef.current?.abort();
    setAiLoading(false);
  };

  const insertGenerated = () => {
    if (sourceMode) {
      setSourceHtml(aiPreview);
    } else if (editorRef.current) {
      editorRef.current.innerHTML = aiPreview;
      updateCount();
    }
    setAiOpen(false);
    setAiPrompt('');
    setAiPreview('');
    setAiDone(false);
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiPreview('');
    setAiDone(false);
    setAiError('');

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';

    abortRef.current = new AbortController();

    const existingContent = sourceMode
      ? sourceHtml
      : (editorRef.current?.innerHTML ?? '');

    try {
      const response = await fetch(`${API_BASE}/v1/llm/generate-html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          nodeName: title,
          prompt: aiPrompt,
          ...(existingContent.trim() ? { existingContent } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        setAiError(`Erreur serveur (${response.status})`);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text !== undefined) {
              accumulated += data.text;
              setAiPreview(accumulated);
            } else if (data.message) {
              setAiError(data.message);
            }
          } catch { /* skip malformed */ }
        }
      }

      setAiDone(true);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAiError((err as Error).message);
      }
    } finally {
      setAiLoading(false);
    }
  };

  // ── Toolbar ────────────────────────────────────────────────────────────────

  const toolbarGroups = [
    [
      { icon: 'B',  title: 'Gras',        action: () => exec('bold'),                   className: 'font-black' },
      { icon: 'I',  title: 'Italique',    action: () => exec('italic'),                 className: 'italic' },
      { icon: 'U',  title: 'Souligné',    action: () => exec('underline'),              className: 'underline' },
    ],
    [
      { icon: 'H2', title: 'Titre 2',     action: () => exec('formatBlock', '<h2>'),    className: '' },
      { icon: 'H3', title: 'Titre 3',     action: () => exec('formatBlock', '<h3>'),    className: '' },
      { icon: 'P',  title: 'Paragraphe',  action: () => exec('formatBlock', '<p>'),     className: '' },
    ],
    [
      { icon: '≡',  title: 'Liste puces', action: () => exec('insertUnorderedList'),    className: '' },
      { icon: '①',  title: 'Liste numérotée', action: () => exec('insertOrderedList'), className: '' },
    ],
    [
      { icon: '⇤',  title: 'Désindenter', action: () => exec('outdent'),               className: '' },
      { icon: '⇥',  title: 'Indenter',    action: () => exec('indent'),                className: '' },
    ],
    [
      {
        icon: '🔗', title: 'Insérer un lien',
        action: () => { const url = prompt('URL :'); if (url) exec('createLink', url); },
        className: '',
      },
      { icon: '—',  title: 'Séparateur',  action: () => exec('insertHorizontalRule'),  className: '' },
      { icon: '✕',  title: 'Effacer mise en forme', action: () => exec('removeFormat'), className: '' },
    ],
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-700/60 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <span className="text-sm">📝</span>
          </div>
          <div>
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">{label}</div>
            <div className="text-sm font-medium text-slate-200 leading-tight truncate max-w-[400px]">{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{wordCount} mot{wordCount !== 1 ? 's' : ''}</span>
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-400 transition-colors"
          >
            Enregistrer
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-900/80 border-b border-slate-700/40 flex-shrink-0 flex-wrap">
        {toolbarGroups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-5 bg-slate-700 mx-1" />}
            {group.map((btn, bi) => (
              <button
                key={bi}
                title={btn.title}
                disabled={sourceMode}
                onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
                className={`min-w-[30px] h-7 px-1.5 rounded text-xs font-semibold transition-colors
                  ${btn.className} text-slate-300 hover:bg-slate-700 hover:text-slate-100
                  disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        ))}

        {/* HTML source toggle */}
        <div className="w-px h-5 bg-slate-700 mx-1" />
        <button
          title="Basculer vers le code HTML source"
          onClick={toggleSourceMode}
          className={`px-2 h-7 rounded text-xs font-mono font-semibold transition-colors
            ${sourceMode
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'}`}
        >
          {'</>'}
        </button>

        {/* AI generate toggle */}
        <div className="w-px h-5 bg-slate-700 mx-1" />
        <button
          title="Générer le contenu avec l'IA"
          onClick={openAi}
          className={`px-2 h-7 rounded text-xs font-semibold transition-colors
            ${aiOpen
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'}`}
        >
          ✨ IA
        </button>
      </div>

      {/* AI Panel */}
      {aiOpen && (
        <div className="flex-shrink-0 border-b border-violet-500/20 bg-slate-900/70 px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex items-start gap-2">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generateWithAI(); }}
                placeholder="Décrivez le contenu à générer… (ex: Explique les boucles for en Python avec des exemples commentés)"
                className="flex-1 bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border
                           border-slate-700 focus:border-violet-500/60 focus:outline-none resize-none leading-relaxed"
                rows={2}
                autoFocus
                disabled={aiLoading}
              />
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={generateWithAI}
                  disabled={!aiPrompt.trim() || aiLoading}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-violet-600 text-white
                             hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aiLoading ? '⏳ Génération…' : '✨ Générer'}
                </button>
                {aiLoading && (
                  <button
                    onClick={cancelAi}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 transition-colors text-center"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </div>

            {/* Streaming preview */}
            {(aiPreview || aiError) && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3 max-h-52 overflow-y-auto">
                {aiError ? (
                  <p className="text-red-400 text-xs">{aiError}</p>
                ) : (
                  <pre className="text-green-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {aiPreview}
                    {aiLoading && <span className="animate-pulse">▌</span>}
                  </pre>
                )}
              </div>
            )}

            {/* Actions after generation */}
            {aiDone && aiPreview && !aiError && (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-500">Contenu HTML généré — remplacera le contenu actuel de l'éditeur.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAiPreview(''); setAiDone(false); }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Rejeter
                  </button>
                  <button
                    onClick={insertGenerated}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white
                               hover:bg-emerald-500 transition-colors"
                  >
                    Insérer dans l'éditeur
                  </button>
                </div>
              </div>
            )}

            {!aiLoading && !aiPreview && (
              <p className="text-[10px] text-slate-500">
                Ctrl+Entrée pour générer · Le contenu existant est envoyé comme contexte si présent.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 flex justify-center">
        {sourceMode ? (
          <textarea
            value={sourceHtml}
            onChange={(e) => setSourceHtml(e.target.value)}
            className="w-full max-w-3xl min-h-full bg-slate-900 text-green-300 text-sm font-mono
                       rounded-xl border border-slate-700 px-6 py-5 focus:outline-none
                       focus:border-amber-500/50 resize-none leading-relaxed"
            placeholder="<p>Votre HTML ici... Vous pouvez inclure des iframes pour les vidéos.</p>"
            spellCheck={false}
          />
        ) : (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={updateCount}
            className="w-full max-w-3xl min-h-full bg-white rounded-xl shadow-lg px-10 py-8
                       text-slate-800 text-base leading-relaxed focus:outline-none"
            style={{ fontFamily: "'Inter', sans-serif" }}
            data-placeholder="Commencez à écrire…"
          />
        )}
      </div>

      <style>{`
        [data-placeholder]:empty:before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
        [contenteditable] h2 { font-size: 1.4rem; font-weight: 700; margin: 1rem 0 0.5rem; color: #1e293b; }
        [contenteditable] h3 { font-size: 1.15rem; font-weight: 600; margin: 0.8rem 0 0.4rem; color: #334155; }
        [contenteditable] p  { margin: 0.5rem 0; }
        [contenteditable] ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        [contenteditable] ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        [contenteditable] a  { color: #3b82f6; text-decoration: underline; }
        [contenteditable] hr { border: none; border-top: 2px solid #e2e8f0; margin: 1rem 0; }
        [contenteditable] table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
        [contenteditable] td, [contenteditable] th { border: 1px solid #e2e8f0; padding: 0.4rem 0.6rem; }
        [contenteditable] iframe { max-width: 100%; border-radius: 8px; }
      `}</style>
    </div>
  );
}
