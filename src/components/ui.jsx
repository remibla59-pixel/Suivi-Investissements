// --- COMPOSANTS UI ---
// Primitives d'interface réutilisables, extraites du composant principal (axe 2 de l'audit),
// habillées « journal de bord » : papier ivoire, encre marine, filets fins, étiquettes mono.
import { useEffect } from "react";
import { AlertCircle, CheckCircle, X, TrendingUp, TrendingDown, Activity } from "lucide-react";

// Nuance d'une couleur (pour décliner les sous-catégories d'une même classe d'actifs).
export const shadeColor = (hex, percent) => {
    const n = parseInt(String(hex).replace('#', ''), 16);
    if (isNaN(n)) return hex;
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const nr = Math.round((t - r) * p + r), ng = Math.round((t - g) * p + g), nb = Math.round((t - b) * p + b);
    return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
};

// Déclinaison déterministe : la 1re sous-catégorie garde la teinte de la classe,
// les suivantes s'éclaircissent ou s'assombrissent pour rester lisibles ensemble.
export const subcategoryShades = (baseHex, index) => shadeColor(baseHex, [0, 26, -20, 42, -34, 56][index % 6]);

export const BlurMoney = ({ amount, currency = '€', privacyMode, className = "" }) => {
    if (privacyMode) {
        return <span className={`bg-gray-200 dark:bg-slate-700 text-transparent rounded px-1 select-none ${className}`}>00000</span>;
    }
    return <span className={`num ${className}`}>{amount.toLocaleString('fr-FR')} {currency}</span>;
};

export const Toast = ({ message, type, onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); }, [onClose]);
  if (!message) return null;
  const tone = type === 'error'
    ? 'border-l-[#8C2F39] text-[#8C2F39] dark:border-l-red-500 dark:text-red-300'
    : 'border-l-[#14603B] text-[#14603B] dark:border-l-emerald-500 dark:text-emerald-300';
  const Icon = type === 'error' ? AlertCircle : CheckCircle;
  return (
    <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 border border-l-2 border-[#E4E0D6] shadow-[0_18px_40px_-24px_rgba(27,42,65,0.45)] flex items-center gap-3 animate-slide-up bg-[#FDFCF9] dark:bg-slate-800 dark:border-slate-700 dark:border-l-2 ${tone}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-medium text-[#16233B] dark:text-white">{message}</span>
      <button onClick={onClose} className="p-0.5 opacity-50 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
    </div>
  );
};

export const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#16233B]/45 backdrop-blur-[2px]">
      <div className="w-full max-w-lg max-h-[92vh] overflow-hidden bg-[#FDFCF9] dark:bg-slate-800 border border-[#D8D2C4] dark:border-slate-700 shadow-[0_30px_70px_-40px_rgba(27,42,65,0.55)] animate-scale-in relative">
        <div className="flex justify-between items-center gap-4 px-5 py-4 border-b border-[#E4E0D6] dark:border-slate-700">
          <div className="min-w-0">
            <span className="kicker block">Journal de bord</span>
            <h3 className="font-bold text-xl text-[#16233B] dark:text-white truncate">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#6E7685] hover:text-[#16233B] dark:text-slate-400 dark:hover:text-white transition-colors" aria-label="Fermer"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-5 overflow-y-auto max-h-[80vh] text-[#2A3B55] dark:text-gray-100">{children}</div>
      </div>
    </div>
  );
};

export const PerformanceBadge = ({ current, invested, tri, twr }) => {
  if (!invested || parseFloat(invested) === 0) return null;
  const perf = ((parseFloat(current) - parseFloat(invested)) / parseFloat(invested)) * 100;
  const isPositive = perf >= 0;
  const stamp = "flex items-center text-[11px] font-semibold px-2 py-1 border tracking-wide mono";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={`${stamp} ${isPositive ? 'border-[#14603B]/30 text-[#14603B] bg-[#EDF3EE] dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-900/20' : 'border-[#8C2F39]/30 text-[#8C2F39] bg-[#F5E7E4] dark:border-red-800 dark:text-red-400 dark:bg-red-900/20'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}{perf > 0 ? '+' : ''}{perf.toFixed(1)}%
      </div>
      {tri !== null && (
        <div className={`${stamp} border-[#1F4E79]/25 text-[#1F4E79] bg-[#EDF2F7] dark:border-indigo-800 dark:text-indigo-400 dark:bg-indigo-900/20`} title="Taux de Rentabilité Interne (Performance annualisée)">
          <Activity className="w-3 h-3 mr-1" />TRI {tri > 0 ? '+' : ''}{tri.toFixed(1)}%/an
        </div>
      )}
      {twr !== null && (
        <div className={`${stamp} border-[#9A6B2F]/25 text-[#9A6B2F] bg-[#F7F0E4] dark:border-amber-800 dark:text-amber-400 dark:bg-amber-900/20`} title="Taux de Rendement Pondéré par le Temps (annualisé, neutralise l'effet des flux)">
          <Activity className="w-3 h-3 mr-1" />TWR {twr > 0 ? '+' : ''}{twr.toFixed(1)}%/an
        </div>
      )}
    </div>
  );
};

// --- GRAPHIQUES (Recharts) : tooltip, légende et réglages d'axes partagés, cohérents clair/sombre ---

// Réglages communs des axes : graduations discrètes en chiffres alignés.
export const axisTickProps = (darkMode) => ({
    fill: darkMode ? '#64748B' : '#8B93A1',
    fontSize: 10.5,
    fontWeight: 500,
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
});

// Grille de fond très discrète (lignes horizontales uniquement), en filet chaud.
export const gridStroke = (darkMode) => ({
    stroke: darkMode ? 'rgba(148,163,184,0.12)' : 'rgba(27,42,65,0.09)',
    vertical: false
});

export const ChartTooltip = ({ active, payload, label, darkMode = false, formatter, extra }) => {
    if (!active || !payload || !payload.length) return null;
    const fmt = formatter || ((v) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v)));
    const rows = payload.filter(e => e.tooltipType !== 'none' && e.name !== 'Socle');
    if (!rows.length) return null;
    const title = label !== undefined && label !== null && label !== '' ? String(label) : null;
    return (
        <div className={`px-3.5 py-2.5 text-xs min-w-[150px] border shadow-[0_16px_40px_-26px_rgba(27,42,65,0.5)] ${darkMode ? 'bg-slate-900/95 border-slate-700 text-white' : 'bg-[#FDFCF9]/97 border-[#D8D2C4] text-[#16233B]'}`}>
            {title && <div className={`kicker mb-1.5 pb-1.5 border-b ${darkMode ? 'border-slate-700 text-slate-400' : 'border-[#E4E0D6]'}`}>{title}</div>}
            <div className="space-y-1.5">
                {rows.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 font-medium opacity-90">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
                            {entry.name}
                        </span>
                        <span className="font-semibold num">{fmt(entry.value, entry)}</span>
                    </div>
                ))}
            </div>
            {extra && <div className={`mt-1.5 pt-1.5 border-t ${darkMode ? 'border-slate-700' : 'border-[#E4E0D6]'}`}>{extra}</div>}
        </div>
    );
};

export const ChartLegend = ({ items, className = "" }) => (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
        {items.map(item => (
            <span key={item.name} className="flex items-center gap-1.5 kicker">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                {item.name}
            </span>
        ))}
    </div>
);

export const inputClass = "w-full border border-[#D8D2C4] dark:border-slate-600 px-3 py-2.5 rounded-sm bg-[#FDFCF9] dark:bg-slate-700 text-[#16233B] dark:text-white focus:ring-1 focus:ring-[#14603B] focus:border-[#14603B] outline-none transition-colors";
export const labelClass = "kicker block mb-1.5";
