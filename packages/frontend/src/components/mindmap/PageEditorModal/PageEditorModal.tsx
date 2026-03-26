import { useEffect, useRef, useState } from 'react';

interface PageEditorModalProps {
  title: string;
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

interface ToolbarBtn {
  icon: string;
  title: string;
  action: () => void;
  active?: boolean;
}

export function PageEditorModal({ title, content, onSave, onClose }: PageEditorModalProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);

  // Sync initial content on mount only
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = content || '';
      updateCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCount = () => {
    const text = editorRef.current?.innerText ?? '';
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
  };

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value ?? undefined);
    updateCount();
  };

  const handleSave = () => {
    onSave(editorRef.current?.innerHTML ?? '');
    onClose();
  };

  const toolbarGroups: ToolbarBtn[][] = [
    [
      { icon: 'B', title: 'Gras (Ctrl+B)', action: () => exec('bold') },
      { icon: 'I', title: 'Italique (Ctrl+I)', action: () => exec('italic') },
      { icon: 'U', title: 'Souligné (Ctrl+U)', action: () => exec('underline') },
    ],
    [
      { icon: 'H2', title: 'Titre 2', action: () => exec('formatBlock', '<h2>') },
      { icon: 'H3', title: 'Titre 3', action: () => exec('formatBlock', '<h3>') },
      { icon: 'P', title: 'Paragraphe', action: () => exec('formatBlock', '<p>') },
    ],
    [
      { icon: '≡', title: 'Liste à puces', action: () => exec('insertUnorderedList') },
      { icon: '①', title: 'Liste numérotée', action: () => exec('insertOrderedList') },
    ],
    [
      { icon: '⇤', title: 'Désindenter', action: () => exec('outdent') },
      { icon: '⇥', title: 'Indenter', action: () => exec('indent') },
    ],
    [
      { icon: '—', title: 'Séparateur horizontal', action: () => exec('insertHorizontalRule') },
      { icon: '🔗', title: 'Insérer un lien', action: () => {
        const url = prompt('URL du lien :');
        if (url) exec('createLink', url);
      }},
      {
        icon: '✕',
        title: 'Effacer la mise en forme',
        action: () => exec('removeFormat'),
      },
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
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Page</div>
            <div className="text-sm font-medium text-slate-200 leading-tight truncate max-w-[400px]">{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{wordCount} mot{wordCount !== 1 ? 's' : ''}</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
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
                onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
                className={`min-w-[30px] h-7 px-1.5 rounded text-xs font-semibold transition-colors
                  ${btn.icon === 'B' ? 'font-black' : ''}
                  ${btn.icon === 'I' ? 'italic' : ''}
                  ${btn.icon === 'U' ? 'underline' : ''}
                  text-slate-300 hover:bg-slate-700 hover:text-slate-100`}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 py-6 flex justify-center">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={updateCount}
          className="w-full max-w-3xl min-h-full bg-white rounded-xl shadow-lg px-10 py-8
                     text-slate-800 text-base leading-relaxed focus:outline-none
                     prose prose-slate max-w-none"
          style={{
            fontFamily: "'Inter', sans-serif",
          }}
          data-placeholder="Commencez à écrire le contenu de la page..."
        />
      </div>

      {/* Placeholder styling */}
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
        [contenteditable] h2 { font-size: 1.4rem; font-weight: 700; margin: 1rem 0 0.5rem; color: #1e293b; }
        [contenteditable] h3 { font-size: 1.15rem; font-weight: 600; margin: 0.8rem 0 0.4rem; color: #334155; }
        [contenteditable] p  { margin: 0.5rem 0; }
        [contenteditable] ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        [contenteditable] ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        [contenteditable] a  { color: #3b82f6; text-decoration: underline; }
        [contenteditable] hr { border: none; border-top: 2px solid #e2e8f0; margin: 1rem 0; }
        [contenteditable] blockquote { border-left: 3px solid #cbd5e1; padding-left: 1rem; color: #64748b; margin: 0.5rem 0; }
      `}</style>
    </div>
  );
}
