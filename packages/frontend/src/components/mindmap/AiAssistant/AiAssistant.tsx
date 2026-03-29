import { useState, useRef } from 'react';
import { generateContent } from '@/api/llm-api';
import { useMindmapStore } from '@/stores/mindmap-store';
import type { MindmapNode } from '@/types/mindmap.types';

const PROMPT_TEMPLATES: Record<string, string[]> = {
  course:    ['Rédige une description engageante pour ce cours', 'Quels sont les objectifs pédagogiques recommandés ?'],
  section:   ['Rédige une description pour cette section', 'Suggère des ressources pertinentes pour cette section'],
  activity:  ['Génère 5 questions QCM sur ce sujet', 'Rédige un énoncé de devoir pour ce module', 'Génère 3 questions vrai/faux'],
  resource:  ['Rédige un résumé structuré pour cette page', 'Rédige une introduction pour cette ressource'],
};

interface Props {
  node: MindmapNode;
  onClose: () => void;
}

export function AiAssistant({ node, onClose }: Props) {
  const { updateNode } = useMindmapStore();
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [tokens, setTokens] = useState<{ input: number; output: number } | null>(null);
  const [error, setError] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const nodeType = node.type as 'course' | 'section' | 'resource' | 'activity';
  const templates = PROMPT_TEMPLATES[nodeType] ?? [];
  const nodeData = node.data as unknown as Record<string, unknown>;

  const handleGenerate = async () => {
    if (!prompt.trim() || streaming) return;
    setOutput('');
    setTokens(null);
    setError('');
    setStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await generateContent(
        {
          nodeType,
          nodeSubtype: nodeData.subtype as string | undefined,
          nodeName:    (nodeData.name ?? nodeData.fullname ?? '') as string,
          prompt,
        },
        (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === 'delta')  setOutput((prev) => prev + (d.text as string));
          if (event === 'done')   setTokens({ input: d.input_tokens as number, output: d.output_tokens as number });
          if (event === 'error')  setError(d.message as string);
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const handleApply = (field: 'intro' | 'content' | 'summary') => {
    updateNode(node.id, { [field]: output });
    onClose();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <span className="text-sm font-semibold text-white">Assistant IA</span>
          <span className="text-xs text-slate-500">{(nodeData.name ?? nodeData.fullname) as string}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Templates */}
        {templates.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Suggestions</div>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button key={t} onClick={() => setPrompt(t)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors">
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt input */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Instruction</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Décris ce que tu veux générer…"
            rows={3}
            className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700
                       focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleGenerate} disabled={!prompt.trim() || streaming}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium
                         transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {streaming ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Génération…
                </>
              ) : '✨ Générer'}
            </button>
            {streaming && (
              <button onClick={handleCancel}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Output */}
        {(output || streaming) && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Résultat</div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 text-sm text-slate-200
                            whitespace-pre-wrap min-h-[80px] font-mono text-xs leading-relaxed">
              {output}
              {streaming && <span className="inline-block w-1.5 h-3.5 bg-indigo-400 animate-pulse ml-0.5" />}
            </div>
            {tokens && (
              <div className="text-xs text-slate-600">
                {tokens.input} tokens entrée · {tokens.output} tokens sortie
              </div>
            )}
            {/* Apply buttons */}
            {!streaming && output && (
              <div className="flex gap-2">
                <button onClick={() => handleApply('intro')}
                  className="flex-1 py-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors">
                  → Intro
                </button>
                {nodeType === 'resource' && (
                  <button onClick={() => handleApply('content')}
                    className="flex-1 py-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors">
                    → Contenu
                  </button>
                )}
                {nodeType === 'section' && (
                  <button onClick={() => handleApply('summary')}
                    className="flex-1 py-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors">
                    → Résumé
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-red-400 text-xs bg-red-500/10 rounded-lg p-3">{error}</div>}
      </div>
    </div>
  );
}
