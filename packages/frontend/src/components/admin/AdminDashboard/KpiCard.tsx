interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color?: 'indigo' | 'green' | 'yellow' | 'red';
}

const colors = {
  indigo: 'bg-indigo-500/10 text-indigo-400',
  green:  'bg-emerald-500/10 text-emerald-400',
  yellow: 'bg-yellow-500/10 text-yellow-400',
  red:    'bg-red-500/10 text-red-400',
};

export function KpiCard({ label, value, sub, icon, color = 'indigo' }: KpiCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${colors[color]}`}>
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
