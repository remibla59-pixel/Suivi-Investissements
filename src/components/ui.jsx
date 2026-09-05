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

export const inputClass = "w-full border border-gray-300 dark:border-slate-600 p-2.5 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors";
export const labelClass = "block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1";
