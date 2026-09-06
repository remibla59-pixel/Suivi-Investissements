// --- COMPOSANTS UI ---
// Primitives d'interface réutilisables, extraites du composant principal (axe 2 de l'audit).
import { useEffect } from "react";
import { AlertCircle, CheckCircle, X, TrendingUp, TrendingDown, Activity } from "lucide-react";

export const BlurMoney = ({ amount, currency = '€', privacyMode, className = "" }) => {
    if (privacyMode) {
        return <span className={`bg-gray-200 dark:bg-slate-700 text-transparent rounded px-1 select-none ${className}`}>00000</span>;
    }
    return <span className={className}>{amount.toLocaleString('fr-FR')} {currency}</span>;
};

export const Toast = ({ message, type, onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); }, [onClose]);
  if (!message) return null;
  const bg = type === 'error' ? 'bg-red-100 border-red-200 text-red-900 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800' : 'bg-emerald-100 border-emerald-200 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800';
  const Icon = type === 'error' ? AlertCircle : CheckCircle;
  return (<div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 animate-slide-up ${bg}`}><Icon className="w-5 h-5" /><span className="font-medium">{message}</span><button onClick={onClose}><X className="w-4 h-4 opacity-50 hover:opacity-100" /></button></div>);
};

export const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in border border-gray-200 dark:border-slate-700 relative">
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50"><h3 className="font-bold text-lg text-gray-900 dark:text-white">{title}</h3><button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500 dark:text-gray-400" /></button></div>
        <div className="p-6 overflow-y-auto max-h-[85vh] text-gray-900 dark:text-gray-100">{children}</div>
      </div>
    </div>
  );
};

export const PerformanceBadge = ({ current, invested, tri, twr }) => { if (!invested || parseFloat(invested) === 0) return null; const perf = ((parseFloat(current) - parseFloat(invested)) / parseFloat(invested)) * 100; const isPositive = perf >= 0; return (<div className="flex flex-wrap items-center gap-2"><div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${isPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}{perf > 0 ? '+' : ''}{perf.toFixed(1)}%</div>{tri !== null && (<div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400`} title="Taux de Rentabilité Interne (Performance annualisée)"><Activity className="w-3 h-3 mr-1" />TRI: {tri > 0 ? '+' : ''}{tri.toFixed(1)}%/an</div>)}{twr !== null && (<div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400`} title="Taux de Rendement Pondéré par le Temps (annualisé, neutralise l'effet des flux)"><Activity className="w-3 h-3 mr-1" />TWR: {twr > 0 ? '+' : ''}{twr.toFixed(1)}%/an</div>)}</div>); };

// --- GRAPHIQUES (Recharts) : tooltip, légende et réglages d'axes partagés, cohérents clair/sombre ---

// Réglages communs des axes : graduations discrètes, sans lignes d'axes
// (à étaler sur chaque XAxis/YAxis).
export const axisTickProps = (darkMode) => ({
    fill: darkMode ? '#64748B' : '#94A3B8',
    fontSize: 11,
    fontWeight: 500
});

// Grille de fond très discrète (lignes horizontales uniquement).
export const gridStroke = (darkMode) => ({
    stroke: darkMode ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.10)',
    vertical: false
});

export const ChartTooltip = ({ active, payload, label, darkMode = false, formatter, extra }) => {
    if (!active || !payload || !payload.length) return null;
    const fmt = formatter || ((v) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v)));
    const rows = payload.filter(e => e.tooltipType !== 'none' && e.name !== 'Socle');
    if (!rows.length) return null;
    const title = label !== undefined && label !== null && label !== '' ? String(label) : null;
    return (
        <div className={`rounded-xl px-3.5 py-2.5 shadow-xl border backdrop-blur-sm text-xs min-w-[150px] ${darkMode ? 'bg-slate-900/95 border-slate-700 text-white' : 'bg-white/95 border-gray-200/70 text-gray-900'}`}>
            {title && <div className={`font-bold mb-1.5 pb-1.5 border-b text-[11px] uppercase tracking-wide ${darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-100 text-gray-400'}`}>{title}</div>}
            <div className="space-y-1.5">
                {rows.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 font-medium opacity-90">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
                            {entry.name}
                        </span>
                        <span className="font-bold tabular-nums">{fmt(entry.value, entry)}</span>
                    </div>
                ))}
            </div>
            {extra && <div className={`mt-1.5 pt-1.5 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>{extra}</div>}
        </div>
    );
};

export const ChartLegend = ({ items, className = "" }) => (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
        {items.map(item => (
            <span key={item.name} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                {item.name}
            </span>
        ))}
    </div>
);

export const inputClass = "w-full border border-gray-300 dark:border-slate-600 p-2.5 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors";
export const labelClass = "block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1";