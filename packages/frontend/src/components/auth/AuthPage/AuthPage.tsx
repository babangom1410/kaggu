import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';

type Tab = 'login' | 'signup';

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 text-slate-100 text-sm rounded-xl px-4 py-2.5
                   border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40
                   focus:outline-none placeholder:text-slate-600 transition-colors"
        required
      />
    </div>
  );
}

export function AuthPage() {
  const { signIn, signUp } = useAuthStore();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (tab === 'login') {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
    } else {
      const { error: err } = await signUp(email, password);
      if (err) setError(err);
      else setInfo('Compte créé. Vérifiez votre email pour confirmer votre inscription.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg mb-3">
            <span className="text-2xl">🗺</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">kàggu</h1>
          <p className="text-sm text-slate-400 mt-1">Éditeur de cours Moodle</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-2xl">
          {/* Tabs */}
          <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setInfo(null); }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  tab === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="vous@exemple.com"
            />
            <InputField
              label="Mot de passe"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 text-xs leading-relaxed">{error}</span>
              </div>
            )}

            {info && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-400 text-xs leading-relaxed">{info}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold
                         bg-indigo-500 text-white hover:bg-indigo-400 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Chargement…' : tab === 'login' ? 'Se connecter' : "Créer un compte"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
