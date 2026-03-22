import { useState } from 'react';
import { useMindmapStore } from '@/stores/mindmap-store';
import { AiAssistant } from '@/components/mindmap/AiAssistant';

const TYPE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  course: { label: 'Cours', icon: '🎓', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  section: { label: 'Section', icon: '📂', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  resource: { label: 'Ressource', icon: '📄', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  activity: { label: 'Activité', icon: '📋', color: 'text-violet-400', bg: 'bg-violet-500/10' },
};

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50
                 focus:outline-none placeholder:text-slate-600 transition-colors"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full"
    >
      <span className="text-sm text-slate-300">{label}</span>
      <div
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
          checked ? 'bg-indigo-500' : 'bg-slate-700'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}

interface PropertiesPanelProps {
  nodeId: string;
}

export function PropertiesPanel({ nodeId }: PropertiesPanelProps) {
  const { nodes, updateNode, deleteNode, setSelectedNode } = useMindmapStore();
  const [aiOpen, setAiOpen] = useState(false);
  const node = nodes.find((n) => n.id === nodeId);

  if (!node) return null;

  const meta = TYPE_META[node.type ?? ''] ?? {
    label: node.type,
    icon: '◻',
    color: 'text-slate-400',
    bg: 'bg-slate-700',
  };

  const data = node.data as unknown as Record<string, unknown>;
  const isRoot = node.id === 'course-root';

  const update = (key: string, value: unknown) => {
    updateNode(nodeId, { [key]: value } as never);
  };

  const handleDelete = () => {
    deleteNode(nodeId);
    setSelectedNode(null);
  };

  if (aiOpen) {
    return (
      <div className="flex flex-col h-full text-slate-200">
        <AiAssistant node={node} onClose={() => setAiOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl ${meta.bg} flex items-center justify-center`}>
              <span className="text-base leading-none">{meta.icon}</span>
            </div>
            <div>
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${meta.color}`}>
                {meta.label}
              </div>
              <div className="text-xs text-slate-500">{nodeId}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
                         bg-indigo-500/15 text-indigo-400 border border-indigo-500/20
                         hover:bg-indigo-500/25 hover:text-indigo-300 transition-colors"
              title="Assistant IA"
            >
              ✨ IA
            </button>
            <button
              onClick={() => setSelectedNode(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500
                         hover:bg-slate-700 hover:text-slate-300 transition-colors"
              title="Fermer"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M1 1l10 10M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Course fields */}
        {node.type === 'course' && (
          <>
            <Field label="Nom complet">
              <TextInput
                value={String(data.fullname ?? '')}
                onChange={(v) => update('fullname', v)}
                placeholder="ex. Physique Quantique L3"
              />
            </Field>
            <Field label="Nom abrégé">
              <TextInput
                value={String(data.shortname ?? '')}
                onChange={(v) => update('shortname', v)}
                placeholder="ex. PQ-L3"
              />
            </Field>
            <Field label="Format">
              <select
                value={String(data.format ?? 'topics')}
                onChange={(e) => update('format', e.target.value)}
                className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                           border border-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value="topics">Par thèmes</option>
                <option value="weeks">Par semaines</option>
                <option value="social">Social</option>
              </select>
            </Field>
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}

        {/* Section fields */}
        {node.type === 'section' && (
          <>
            <Field label="Nom">
              <TextInput
                value={String(data.name ?? '')}
                onChange={(v) => update('name', v)}
                placeholder="ex. Introduction"
              />
            </Field>
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}

        {/* Resource fields */}
        {node.type === 'resource' && (
          <>
            <Field label="Nom">
              <TextInput
                value={String(data.name ?? '')}
                onChange={(v) => update('name', v)}
                placeholder="Nom de la ressource"
              />
            </Field>
            {data.subtype === 'file' && (
              <Field label="Fichier">
                <div className="space-y-2">
                  <label className="flex items-center justify-center gap-2 w-full py-2 rounded-lg
                                    border border-dashed border-slate-600 hover:border-indigo-500
                                    text-xs text-slate-400 hover:text-slate-200 cursor-pointer
                                    bg-slate-800/50 transition-colors">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v8M3 5l3.5-4 3.5 4M1 10v1a1 1 0 001 1h9a1 1 0 001-1v-1"
                        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {data.filename ? 'Changer le fichier' : 'Choisir un fichier'}
                    <input type="file" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 20 * 1024 * 1024) {
                          alert('Fichier trop volumineux (max 20 Mo)');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(',')[1];
                          update('filename', file.name);
                          update('filedata', base64);
                          update('filesize', file.size);
                          update('filetype', file.type);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {data.filename as string && (
                    <div className="flex items-center justify-between px-2 py-1.5 bg-slate-800 rounded-lg">
                      <span className="text-xs text-slate-300 truncate max-w-[160px]">{String(data.filename)}</span>
                      <span className="text-xs text-slate-500 ml-2 shrink-0">
                        {data.filesize ? `${Math.round(Number(data.filesize) / 1024)} Ko` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </Field>
            )}
            {data.subtype === 'url' && (
              <Field label="URL">
                <TextInput
                  value={String(data.url ?? '')}
                  onChange={(v) => update('url', v)}
                  placeholder="https://..."
                />
              </Field>
            )}
            {data.subtype === 'page' && (
              <Field label="Contenu">
                <textarea
                  value={String(data.content ?? '')}
                  onChange={(e) => update('content', e.target.value)}
                  placeholder="Contenu de la page..."
                  rows={4}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                             border border-slate-700 focus:border-indigo-500 focus:outline-none
                             placeholder:text-slate-600 resize-none"
                />
              </Field>
            )}
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}

        {/* Activity fields */}
        {node.type === 'activity' && (
          <>
            <Field label="Nom">
              <TextInput
                value={String(data.name ?? '')}
                onChange={(v) => update('name', v)}
                placeholder="Nom de l'activité"
              />
            </Field>
            {data.subtype === 'assign' && (
              <>
                <Field label="Note maximale">
                  <TextInput
                    value={String(data.maxgrade ?? 100)}
                    onChange={(v) => update('maxgrade', Number(v))}
                    placeholder="100"
                  />
                </Field>
                <Field label="Type de remise">
                  <select
                    value={String(data.submissiontype ?? 'file')}
                    onChange={(e) => update('submissiontype', e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                               border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="file">Fichier</option>
                    <option value="online_text">Texte en ligne</option>
                    <option value="both">Les deux</option>
                  </select>
                </Field>
              </>
            )}
            {data.subtype === 'quiz' && (
              <>
                <Field label="Tentatives">
                  <TextInput
                    value={String(data.attempts ?? '')}
                    onChange={(v) => update('attempts', Number(v))}
                    placeholder="Illimité"
                  />
                </Field>
                <Field label="Limite de temps (min)">
                  <TextInput
                    value={data.timelimit ? String(Number(data.timelimit) / 60) : ''}
                    onChange={(v) => update('timelimit', Number(v) * 60)}
                    placeholder="Aucune"
                  />
                </Field>
              </>
            )}
            {data.subtype === 'forum' && (
              <Field label="Type de forum">
                <select
                  value={String(data.type ?? 'general')}
                  onChange={(e) => update('type', e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                             border border-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="general">Général</option>
                  <option value="single">Discussion unique</option>
                  <option value="qanda">Questions/Réponses</option>
                  <option value="blog">Blog</option>
                  <option value="eachuser">Un sujet par participant</option>
                </select>
              </Field>
            )}
            <Toggle
              checked={Boolean(data.visible)}
              onChange={(v) => update('visible', v)}
              label="Visible"
            />
          </>
        )}
      </div>

      {/* Footer — delete */}
      {!isRoot && (
        <div className="px-5 py-4 border-t border-slate-700/50">
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm
                       text-red-400 border border-red-500/20 bg-red-500/5
                       hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30
                       transition-all duration-150"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M1.5 3h10M4.5 3V2a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v4M7.5 6v4M2.5 3l.7 8a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Supprimer le nœud
          </button>
        </div>
      )}
    </div>
  );
}
