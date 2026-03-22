import { useState } from 'react';
import { generateCourseStructure } from '@/api/llm-api';
import { useMindmapStore } from '@/stores/mindmap-store';

interface CourseStructure {
  courseName: string;
  sections: Array<{
    name: string;
    summary: string;
    nodes: Array<{
      type: 'activity' | 'resource';
      subtype: string;
      name: string;
      intro: string;
    }>;
  }>;
}

interface Props {
  onClose: () => void;
}

export function CourseStructureWizard({ onClose }: Props) {
  const { nodes, addNode } = useMindmapStore();
  const [description, setDescription] = useState('');
  const [output, setOutput] = useState('');
  const [structure, setStructure] = useState<CourseStructure | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  const examples = [
    'Cours de mathématiques pour lycée, 8 semaines, avec exercices et évaluations',
    'Formation Python pour débutants, 6 modules, avec quiz hebdomadaires',
    'Cours d\'histoire médiévale pour L1, 12 semaines, avec sources primaires',
  ];

  const handleGenerate = async () => {
    if (!description.trim() || streaming) return;
    setOutput('');
    setStructure(null);
    setError('');
    setApplied(false);
    setStreaming(true);

    try {
      await generateCourseStructure(description, (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === 'delta')  setOutput((prev) => prev + (d.text as string));
        if (event === 'done' && d.structure) setStructure(d.structure as CourseStructure);
        if (event === 'error') setError(d.message as string);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(false);
    }
  };

  const handleApply = () => {
    if (!structure) return;

    // Find root course node
    const courseNode = nodes.find((n) => n.type === 'course');
    if (!courseNode) return;

    // Update course name
    useMindmapStore.getState().updateNode(courseNode.id, { fullname: structure.courseName });

    // Add sections and their children
    structure.sections.forEach((section, sIdx) => {
      const sectionId = `ai-section-${Date.now()}-${sIdx}`;
      const sectionX = courseNode.position.x + (sIdx - structure.sections.length / 2) * 300;
      const sectionY = courseNode.position.y + 200;

      addNode({
        id: sectionId,
        type: 'section',
        position: { x: sectionX, y: sectionY },
        data: { name: section.name, summary: section.summary, visible: true },
      } as never, courseNode.id);

      section.nodes.forEach((child, cIdx) => {
        const childId = `ai-node-${Date.now()}-${sIdx}-${cIdx}`;
        addNode({
          id: childId,
          type: child.type,
          position: { x: sectionX + (cIdx - section.nodes.length / 2) * 220, y: sectionY + 200 },
          data: { name: child.name, subtype: child.subtype as never, intro: child.intro, visible: true },
        } as never, sectionId);
      });
    });

    setApplied(true);
    setTimeout(onClose, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span>✨</span> Assistant de conception
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Génère une structure de cours complète</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Examples */}
          <div className="space-y-2">
            <div className="text-xs text-slate-400 font-medium">Exemples</div>
            <div className="space-y-1.5">
              {examples.map((ex) => (
                <button key={ex} onClick={() => setDescription(ex)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <div className="text-xs text-slate-400 font-medium">Description du cours</div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Décris ton cours : discipline, niveau, durée, type d'activités souhaitées…"
              rows={4}
              className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700
                         focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none" />
            <button onClick={handleGenerate} disabled={!description.trim() || streaming}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium
                         transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {streaming ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Génération…</>
              ) : '✨ Générer la structure'}
            </button>
          </div>

          {/* Output preview */}
          {structure && !streaming && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 font-medium">Aperçu — {structure.sections.length} sections</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {structure.sections.map((s, i) => (
                  <div key={i} className="bg-slate-800 rounded-lg p-3">
                    <div className="text-sm font-medium text-emerald-400">📂 {s.name}</div>
                    <div className="mt-1 space-y-0.5">
                      {s.nodes.map((n, j) => (
                        <div key={j} className="text-xs text-slate-400 pl-3">
                          {n.type === 'activity' ? '📋' : '📄'} {n.name}
                          <span className="text-slate-600 ml-1">({n.subtype})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {output && !structure && !streaming && (
            <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {output}
            </div>
          )}

          {streaming && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-slate-500 border-t-indigo-400 rounded-full animate-spin" />
              Génération en cours…
            </div>
          )}

          {error && <div className="text-red-400 text-xs bg-red-500/10 rounded-lg p-3">{error}</div>}
          {applied && <div className="text-emerald-400 text-xs bg-emerald-500/10 rounded-lg p-3">✅ Structure appliquée au mindmap !</div>}
        </div>

        {/* Footer */}
        {structure && !streaming && !applied && (
          <div className="px-6 py-4 border-t border-slate-700 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
              Annuler
            </button>
            <button onClick={handleApply}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-medium transition-colors">
              Appliquer au mindmap
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
