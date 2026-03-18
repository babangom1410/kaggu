import { useState } from 'react';
import { useMindmapStore } from '@/stores/mindmap-store';
import { moodleApi, type MoodleCategory } from '@/lib/api';
import type { MoodleConfig } from '@/types/mindmap.types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="bg-slate-800 text-sm text-slate-100 rounded-lg px-3 py-2
                 border border-slate-700 focus:outline-none focus:border-indigo-500
                 placeholder:text-slate-600 w-full"
    />
  );
}

type PanelState = 'form' | 'connecting' | 'connected';

export function MoodlePanel() {
  const { moodleConfig, setMoodleConfig, setMoodlePanelOpen, projectId } = useMindmapStore();

  const [url, setUrl] = useState(moodleConfig?.url ?? '');
  const [token, setToken] = useState(moodleConfig?.token ?? '');
  const [error, setError] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<PanelState>(moodleConfig ? 'connected' : 'form');
  const [categories, setCategories] = useState<MoodleCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const handleConnect = async () => {
    if (!url.trim() || !token.trim()) {
      setError('URL and token are required');
      return;
    }
    setError(null);
    setPanelState('connecting');

    const { data, error: connErr } = await moodleApi.connect(url.trim(), token.trim());
    if (connErr || !data) {
      setError(connErr ?? 'Connection failed');
      setPanelState('form');
      return;
    }

    const newConfig: MoodleConfig = {
      url: url.trim(),
      token: token.trim(),
      courseId: moodleConfig?.courseId ?? null,
      siteInfo: {
        sitename: data.sitename,
        username: data.username,
        moodleVersion: data.moodleVersion,
        release: data.release,
        hasPlugin: data.hasPlugin,
      },
    };

    setMoodleConfig(newConfig);
    setPanelState('connected');

    // Load categories in background
    setLoadingCategories(true);
    const { data: cats } = await moodleApi.categories(url.trim(), token.trim());
    if (cats) setCategories(cats);
    setLoadingCategories(false);
  };

  const handleDisconnect = () => {
    setMoodleConfig(null);
    setUrl('');
    setToken('');
    setCategories([]);
    setPanelState('form');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-orange-500/20 flex items-center justify-center">
            <span className="text-xs">🔌</span>
          </div>
          <span className="text-sm font-semibold text-slate-200">Connexion Moodle</span>
        </div>
        <button
          onClick={() => setMoodlePanelOpen(false)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500
                     hover:bg-slate-700 hover:text-slate-300 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {panelState === 'connecting' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Connexion à Moodle…</span>
          </div>
        )}

        {panelState === 'connected' && moodleConfig?.siteInfo && (
          <>
            {/* Connection status */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400">Connecté</span>
              </div>
              <div className="text-sm font-medium text-slate-200">{moodleConfig.siteInfo.sitename}</div>
              <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                <span>Utilisateur : <span className="text-slate-300">{moodleConfig.siteInfo.username}</span></span>
                <span>Version : <span className="text-slate-300">{moodleConfig.siteInfo.moodleVersion}</span></span>
              </div>
            </div>

            {/* Plugin status */}
            <div className={`rounded-xl p-3 border text-xs ${
              moodleConfig.siteInfo.hasPlugin
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              {moodleConfig.siteInfo.hasPlugin ? (
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Plugin <code className="font-mono">local_kaggu</code> installé</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <span>⚠</span>
                    <span>Plugin <code className="font-mono">local_kaggu</code> non installé</span>
                  </div>
                  <p className="text-amber-500/80">
                    La création d'activités et ressources nécessite le plugin.
                    L'export se limitera à la création du cours et des sections.
                  </p>
                </div>
              )}
            </div>

            {/* Connected course */}
            {moodleConfig.courseId && (
              <div className="bg-slate-800 rounded-xl p-3 space-y-1">
                <div className="text-xs text-slate-400 font-medium">Cours Moodle lié</div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">Cours #{moodleConfig.courseId}</span>
                  <a
                    href={`${moodleConfig.url}/course/view.php?id=${moodleConfig.courseId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Ouvrir ↗
                  </a>
                </div>
              </div>
            )}

            {/* Categories */}
            {!moodleConfig.courseId && (
              <Field label="Catégorie du cours">
                {loadingCategories ? (
                  <div className="text-xs text-slate-500">Chargement des catégories…</div>
                ) : categories.length > 0 ? (
                  <select
                    className="bg-slate-800 text-sm text-slate-100 rounded-lg px-3 py-2
                               border border-slate-700 focus:outline-none focus:border-indigo-500 w-full"
                    defaultValue="1"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {'  '.repeat(cat.depth)}{cat.name} ({cat.coursecount})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-slate-500">Aucune catégorie disponible</div>
                )}
              </Field>
            )}

            {/* Disconnect */}
            <button
              onClick={handleDisconnect}
              className="w-full text-xs text-slate-500 hover:text-red-400 transition-colors py-2"
            >
              Déconnecter
            </button>
          </>
        )}

        {panelState === 'form' && (
          <>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connectez-vous à votre instance Moodle pour exporter et importer des cours.
            </p>

            <Field label="URL Moodle">
              <Input
                type="url"
                placeholder="https://moodle.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field label="Token Web Services">
              <Input
                type="password"
                placeholder="abc123def456..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
            </Field>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="bg-slate-800/50 rounded-xl p-3 space-y-1.5 text-xs text-slate-400">
              <div className="font-medium text-slate-300">Prérequis Moodle</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Activer les Web Services dans les réglages d'administration</li>
                <li>Activer le protocole REST</li>
                <li>Créer un token pour un utilisateur avec le rôle gestionnaire</li>
                <li>Installer le plugin <code className="font-mono text-amber-400">local_kaggu</code></li>
              </ul>
            </div>

            <button
              onClick={handleConnect}
              disabled={!url.trim() || !token.trim()}
              className="w-full py-2 px-4 rounded-lg text-sm font-semibold
                         bg-indigo-600 text-white hover:bg-indigo-500 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Tester la connexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}
