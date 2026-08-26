import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PlusCircle, Trash2, Edit2, Building2, Wallet, TrendingUp, PieChart as PieChartIcon, BarChart3, ChevronRight, ArrowLeft, X, AlertCircle, DollarSign, Home, Gem, TrendingDown, Download, Upload, Coins, Target, ArrowDownCircle, ArrowUpCircle, History, LogOut, Loader2, Save, Moon, Sun, CheckCircle, ArrowRightLeft, Percent, HelpCircle, Activity, RotateCcw, Calculator, Calendar, GitCompare, Flag, Eye, EyeOff } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// --- CONFIGURATION FIREBASE ---
// ⚠️ VÉRIFIEZ ET REMPLACEZ VOS IDENTIFIANTS ICI ⚠️
const firebaseConfig = {
  apiKey: "AIzaSyAKCcte2Jd6Ckw2FJTIQy5uqskpE35YtvA",
  authDomain: "suivi-investissements-9e9ea.firebaseapp.com",
  projectId: "suivi-investissements-9e9ea",
  storageBucket: "suivi-investissements-9e9ea.firebasestorage.app",
  messagingSenderId: "124675947188",
  appId: "1:124675947188:web:25294b7d1c3620100a35e1"
};

// Initialisation conditionnelle
let auth, db, provider;
try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
} catch (e) {
    console.error("Erreur Firebase: Config manquante", e);
}

// --- CONSTANTES ---
const INVESTMENT_CATEGORIES = [
  { value: 'actions', label: 'Actions / ETF', color: '#10B981', icon: TrendingUp },
  { value: 'fondsEuros', label: 'Fonds Euros', color: '#3B82F6', icon: DollarSign },
  { value: 'obligations', label: 'Obligations', color: '#F59E0B', icon: TrendingDown },
  { value: 'crypto', label: 'Crypto', color: '#6366F1', icon: BarChart3 },
  { value: 'or', label: 'Or / Métaux', color: '#FCD34D', icon: Gem },
  { value: 'immobilier', label: 'Immobilier (SCPI)', color: '#EF4444', icon: Home },
  { value: 'liquidites', label: 'Liquidités', color: '#6B7280', icon: Wallet },
  { value: 'dette', label: 'Dette / Levier', color: '#DC2626', icon: TrendingDown },
  { value: 'autre', label: 'Autre', color: '#9CA3AF', icon: PieChartIcon }
];

const ACCOUNT_TYPES = [
  { value: 'PEA', label: 'PEA', color: '#3B82F6' },
  { value: 'CTO', label: 'Compte Titres', color: '#10B981' },
  { value: 'AV', label: 'Assurance Vie', color: '#F59E0B' },
  { value: 'PER', label: 'PER', color: '#8B5CF6' },
  { value: 'PEE', label: 'PEE', color: '#EC4899' },
  { value: 'Crypto', label: 'Crypto', color: '#EF4444' },
  { value: 'Livret', label: 'Livret', color: '#14B8A6' },
  { value: 'Autre', label: 'Autre', color: '#6B7280' }
];

const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dollar US' },
  { code: 'GBP', symbol: '£', label: 'Livre Sterling' },
  { code: 'CHF', symbol: 'CHF', label: 'Franc Suisse' },
  { code: 'BTC', symbol: '₿', label: 'Bitcoin' },
];

// --- UTILS & CALCULS ---

// Calcul du TRI (XIRR)
const calculateXIRR = (movements, currentValue) => {
    if (!movements || movements.length === 0 || currentValue === 0) return null;
    const flows = movements.map(m => ({
        amount: m.type === 'withdrawal' ? parseFloat(m.amount) : -parseFloat(m.amount),
        date: new Date(m.date).getTime()
    }));
    flows.push({ amount: parseFloat(currentValue), date: new Date().getTime() });
    flows.sort((a, b) => a.date - b.date);
    if ((flows[flows.length - 1].date - flows[0].date) < 30 * 24 * 3600 * 1000) return null;

    let x0 = 0.1; const tol = 0.00001; const maxIter = 50;
    for (let i = 0; i < maxIter; i++) {
        let fValue = 0; let fDerivative = 0;
        for (const flow of flows) {
            const years = (flow.date - flows[0].date) / (365.25 * 24 * 3600 * 1000);
            const factor = Math.pow(1 + x0, years);
            fValue += flow.amount / factor;
            fDerivative -= (years * flow.amount) / (factor * (1 + x0));
        }
        if (Math.abs(fValue) < tol) return x0 * 100;
        if (Math.abs(fDerivative) < tol) break;
        const newX = x0 - fValue / fDerivative;
        if (isNaN(newX) || Math.abs(newX) > 10) break; 
        if (Math.abs(newX - x0) < tol) return newX * 100;
        x0 = newX;
    }
    return null;
};

// Calcul du TWR (Time-Weighted Return)
const calculateTWR = (movements, snapshots, currentValue) => {
    if (!movements || movements.length === 0) return null;
    
    // On combine mouvements et snapshots pour avoir les points de valorisation
    // Un TWR propre nécessite la valeur juste avant chaque flux.
    const events = [];
    
    movements.forEach(m => {
        events.push({
            date: new Date(m.date).getTime(),
            type: 'flow',
            amount: m.type === 'withdrawal' ? -parseFloat(m.amount) : parseFloat(m.amount),
            preValuation: m.preValuation ? parseFloat(m.preValuation) : null
        });
    });
    
    snapshots.forEach(s => {
        events.push({
            date: new Date(s.date).getTime(),
            type: 'valuation',
            value: parseFloat(s.amount)
        });
    });
    
    // Ajouter la valeur actuelle comme point final
    events.push({
        date: new Date().getTime(),
        type: 'valuation',
        value: parseFloat(currentValue)
    });
    
    events.sort((a, b) => a.date - b.date);
    
    let totalTWR = 1;
    let lastValue = 0;
    let hasStarted = false;

    // Le TWR commence au premier flux (dépôt initial)
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        
        if (e.type === 'flow') {
            if (!hasStarted) {
                // Premier dépôt
                if (e.amount > 0) {
                    lastValue = e.amount;
                    hasStarted = true;
                }
                continue;
            }
            
            // On a un flux. On cherche la valeur juste avant ce flux.
            // Si preValuation est fournie, on l'utilise.
            // Sinon on utilise la dernière valeur connue (lastValue)
            const valBefore = e.preValuation !== null ? e.preValuation : lastValue;
            
            if (lastValue > 0) {
                const periodReturn = (valBefore / lastValue);
                totalTWR *= periodReturn;
            }
            
            // Nouvelle base après le flux
            lastValue = valBefore + e.amount;
        } else if (e.type === 'valuation') {
            if (!hasStarted) continue;
            
            const periodReturn = (e.value / lastValue);
            totalTWR *= periodReturn;
            lastValue = e.value;
        }
    }
    
    return (totalTWR - 1) * 100;
};
// Calcul du Ratio de Sharpe (rendement ajusté au risque)
const calculateSharpeRatio = (monthlyReturns, riskFreeRate = 0.03) => {
    if (!monthlyReturns || monthlyReturns.length < 2) return null;
    
    const avgReturn = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    const annualizedReturn = avgReturn * 12; // Annualisation
    
    // Calcul de la volatilité (écart-type)
    const squaredDiffs = monthlyReturns.map(r => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(12); // Annualisation
    
    if (volatility === 0) return null;
    
    return (annualizedReturn - riskFreeRate) / volatility;
};

// Calcul des performances par année glissante
const calculateRollingYearPerformance = (brokers) => {
    const stats = processMonthlyStats(brokers);
    if (stats.length < 12) return [];
    
    const rollingPerf = [];
    
    for (let i = 11; i < stats.length; i++) {
        const endMonth = stats[i];
        const startMonth = stats[i - 11]; // 12 mois avant (i-11 car on inclut le mois de départ)
        
        const startValue = startMonth.value;
        const endValue = endMonth.value;
        
        // Calcul des flux sur la période
        const flowsInPeriod = stats.slice(i - 11, i + 1).reduce((sum, s) => sum + s.flow, 0);
        
        // Performance = (Valeur finale - Valeur initiale - Flux) / (Valeur initiale + Flux/2)
        const avgCapital = startValue + (flowsInPeriod / 2);
        const performance = avgCapital > 0 ? ((endValue - startValue - flowsInPeriod) / avgCapital) * 100 : 0;
        
        rollingPerf.push({
            endDate: endMonth.month,
            displayDate: endMonth.displayDate,
            performance: performance,
            startValue: startValue,
            endValue: endValue,
            flows: flowsInPeriod
        });
    }
    
    return rollingPerf;
};

// Calcul du capital net investi à une date précise
const getNetInvestedUntilDate = (movements, dateStr) => {
    const targetDate = new Date(dateStr).getTime();
    return (movements || []).reduce((acc, m) => {
        const mDate = new Date(m.date).getTime();
        if (mDate <= targetDate) {
            if (m.type === 'deposit' || m.type === 'interest') return acc + parseFloat(m.amount);
            // Si retrait : on ne soustrait QUE la part de capital
            if (m.type === 'withdrawal') {
                const capitalToRemove = m.capitalPart !== undefined && m.capitalPart !== null 
                    ? parseFloat(m.capitalPart) 
                    : parseFloat(m.amount);
                return acc - capitalToRemove;
            }
        }
        return acc;
    }, 0);
};

// --- HELPER AGREGATION MENSUELLE ---
const processMonthlyStats = (brokers) => {
    let minDateMs = Date.now();
    let hasData = false;

    brokers.forEach(b => b.accounts.forEach(a => {
        if (a.snapshots?.length) {
            hasData = true;
            const dates = a.snapshots.map(s => new Date(s.date).getTime());
            minDateMs = Math.min(minDateMs, ...dates);
        }
        if (a.movements?.length) {
            hasData = true;
            const dates = a.movements.map(m => new Date(m.date).getTime());
            minDateMs = Math.min(minDateMs, ...dates);
        }
    }));

    if (!hasData) return [];

    const startDate = new Date(minDateMs);
    startDate.setDate(1); 
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date();
    endDate.setDate(1); 
    
    const stats = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const monthStr = `${year}-${month}`; 
        
        const lastDay = new Date(year, currentDate.getMonth() + 1, 0).getDate();
        const endOfMonthStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`; 

        let totalValue = 0;
        let totalFlows = 0;     
        let totalInvested = 0;

        brokers.forEach(broker => {
            broker.accounts.forEach(account => {
                const rate = parseFloat(account.exchangeRate || 1);

                const relevantSnapshots = (account.snapshots || []).filter(s => s.date <= endOfMonthStr);
                const lastSnap = relevantSnapshots.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                
                if (lastSnap) {
                    totalValue += parseFloat(lastSnap.amount) * rate;
                }

                const monthMoves = (account.movements || []).filter(m => m.date.startsWith(monthStr));
                monthMoves.forEach(m => {
                    const amount = parseFloat(m.amount) * rate;
                    if (m.type === 'deposit') totalFlows += amount;
                    else if (m.type === 'withdrawal') totalFlows -= amount;
                });

                totalInvested += getNetInvestedUntilDate(account.movements || [], endOfMonthStr) * rate;
            });
        });

        stats.push({ 
            month: monthStr, 
            displayDate: currentDate.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), 
            value: totalValue, 
            flow: totalFlows,
            invested: totalInvested 
        });

        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return stats.map((stat, i) => {
        if (i === 0) {
            const performance = stat.value - stat.flow; 
            let denominator = stat.flow * 0.5;
            if (denominator === 0) denominator = stat.value;
            
            return { 
                ...stat, 
                variation: stat.value, 
                performance: performance, 
                yield: (denominator > 0) ? (performance / denominator) * 100 : 0 
            };
        }
        
        const prev = stats[i - 1];
        const variation = stat.value - prev.value;
        const performance = variation - stat.flow;
        
        let denominator = prev.value + (stat.flow * 0.5);
        
        if (Math.abs(denominator) < 1) denominator = stat.flow * 0.5;
        if (denominator === 0) denominator = 1;

        const yieldPct = (performance / denominator) * 100;

        return { ...stat, variation, performance, yield: yieldPct };
    });
};


// --- COMPOSANTS UI ---

const BlurMoney = ({ amount, currency = '€', privacyMode, className = "" }) => {
    if (privacyMode) {
        return <span className={`bg-gray-200 dark:bg-slate-700 text-transparent rounded px-1 select-none ${className}`}>00000</span>;
    }
    return <span className={className}>{amount.toLocaleString('fr-FR')} {currency}</span>;
};

const Toast = ({ message, type, onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); }, [onClose]);
  if (!message) return null;
  const bg = type === 'error' ? 'bg-red-100 border-red-200 text-red-900 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800' : 'bg-emerald-100 border-emerald-200 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800';
  const Icon = type === 'error' ? AlertCircle : CheckCircle;
  return (<div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 animate-slide-up ${bg}`}><Icon className="w-5 h-5" /><span className="font-medium">{message}</span><button onClick={onClose}><X className="w-4 h-4 opacity-50 hover:opacity-100" /></button></div>);
};

const Modal = ({ isOpen, onClose, title, children }) => {
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

const inputClass = "w-full border border-gray-300 dark:border-slate-600 p-2.5 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors";
const labelClass = "block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1";

// --- VUES SECONDAIRES ---

const SimulationView = ({ currentTotal, globalTRI, patrimonyGoal, privacyMode }) => {
    const [monthlyContribution, setMonthlyContribution] = useState(500);
    const [years, setYears] = useState(20);
    const [expectedReturn, setExpectedReturn] = useState(5);

    const { data, goalHitTarget, goalHitHistorical } = useMemo(() => {
        let result = [];
        let capitalTarget = currentTotal;
        let capitalHistorical = currentTotal;
        let totalInvested = currentTotal;
        let targetHit = null;
        let historicalHit = null;
        const monthlyRateTarget = expectedReturn / 100 / 12;
        const monthlyRateHistorical = (globalTRI || 0) / 100 / 12; 

        for (let y = 0; y <= years; y++) {
            result.push({
                year: y === 0 ? 'Auj.' : `+${y}`,
                capitalTarget: Math.round(capitalTarget),
                capitalHistorical: globalTRI ? Math.round(capitalHistorical) : null,
                invested: Math.round(totalInvested)
            });
            if (!targetHit && capitalTarget >= patrimonyGoal) targetHit = y;
            if (globalTRI && !historicalHit && capitalHistorical >= patrimonyGoal) historicalHit = y;
            for (let m = 0; m < 12; m++) {
                capitalTarget = (capitalTarget + monthlyContribution) * (1 + monthlyRateTarget);
                capitalHistorical = (capitalHistorical + monthlyContribution) * (1 + monthlyRateHistorical);
                totalInvested += monthlyContribution;
            }
        }
        return { data: result, goalHitTarget: targetHit, goalHitHistorical: historicalHit };
    }, [currentTotal, monthlyContribution, years, expectedReturn, globalTRI, patrimonyGoal]);

    const finalTarget = data[data.length - 1].capitalTarget;
    const finalInvested = data[data.length - 1].invested;

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-6xl mx-auto">
             <div className="flex items-center gap-3 mb-2">
                <div className="bg-indigo-600 p-2 rounded-lg text-white"><Calculator className="w-6 h-6" /></div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Simulateur & Comparateur</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4 lg:col-span-3 space-y-4">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg space-y-4">
                        <h3 className="font-bold text-gray-800 dark:text-white border-b border-gray-100 dark:border-slate-700 pb-2">Paramètres</h3>
                        <div><label className={labelClass}>Apport Initial</label><div className={`${inputClass} bg-gray-100 dark:bg-slate-900 opacity-70 flex items-center`}><BlurMoney amount={currentTotal.toFixed(0)} privacyMode={privacyMode} /></div></div>
                        <div><label className={labelClass}>Épargne Mensuelle (€)</label><input type="number" value={monthlyContribution} onChange={e => setMonthlyContribution(parseFloat(e.target.value) || 0)} className={inputClass} /></div>
                        <div><label className={labelClass}>Rendement Cible (%)</label><input type="number" step="0.1" value={expectedReturn} onChange={e => setExpectedReturn(parseFloat(e.target.value) || 0)} className={inputClass} /></div>
                        <div><label className={labelClass}>Durée (Années)</label><input type="range" min="1" max="40" value={years} onChange={e => setYears(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" /><div className="text-center font-bold mt-2 text-blue-600 dark:text-blue-400">{years} ans</div></div>
                        <div className="pt-2 border-t border-gray-100 dark:border-slate-700"><div className="flex justify-between items-center mb-1"><label className="text-xs font-bold text-gray-500">Objectif (Ligne Rouge)</label><span className="text-xs font-bold text-red-500"><BlurMoney amount={patrimonyGoal} privacyMode={privacyMode} /></span></div></div>
                    </div>
                </div>
                <div className="md:col-span-8 lg:col-span-9 space-y-6">
                    <div className="bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-700/50 p-4 rounded-xl border border-gray-200 dark:border-slate-600 flex flex-col sm:flex-row gap-4 items-center justify-between">
                         <div className="flex items-center gap-3"><div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full"><Flag className="w-5 h-5 text-red-600 dark:text-red-400" /></div><div><div className="text-sm font-bold text-gray-500 dark:text-gray-400">Objectif : <BlurMoney amount={patrimonyGoal} privacyMode={privacyMode} /></div><div className="font-bold text-gray-800 dark:text-white">{goalHitTarget ? `Atteint dans ${goalHitTarget} ans (Scénario Cible)` : <span className="text-orange-500">Non atteint sur {years} ans (Cible)</span>}</div></div></div>
                         {globalTRI && (<div className="text-right border-l pl-4 border-gray-200 dark:border-gray-600"><div className="text-xs text-gray-500 dark:text-gray-400">Selon historique ({globalTRI.toFixed(1)}%)</div><div className="font-bold text-purple-600 dark:text-purple-400">{goalHitHistorical ? `Atteint dans ${goalHitHistorical} ans` : 'Non atteint'}</div></div>)}
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                        <div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient><linearGradient id="colorHist" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" /><XAxis dataKey="year" fontSize={12} stroke="#9CA3AF" interval={years > 10 ? 4 : 1} /><YAxis domain={['dataMin', 'dataMax']} fontSize={12} stroke="#9CA3AF" tickFormatter={v => privacyMode ? '****' : `${(v/1000).toFixed(0)}k`} /><Tooltip contentStyle={{borderRadius:'8px', border:'none', backgroundColor:'#1e293b', color:'#fff'}} formatter={(value) => privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)} /><Legend /><ReferenceLine y={patrimonyGoal} stroke="#EF4444" strokeDasharray="3 3" /><Area type="monotone" dataKey="capitalTarget" name={`Scénario Cible (${expectedReturn}%)`} stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorTarget)" isAnimationActive={false} />{globalTRI && <Area type="monotone" dataKey="capitalHistorical" name={`Scénario Historique (${globalTRI.toFixed(1)}%)`} stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorHist)" isAnimationActive={false} />}<Line type="monotone" dataKey="invested" name="Capital Versé" stroke="#10B981" strokeDasharray="5 5" strokeWidth={2} isAnimationActive={false} dot={false} /></AreaChart></ResponsiveContainer></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-xl border border-gray-200 dark:border-slate-600"><div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Capital Investi (Total)</div><div className="text-2xl font-bold text-gray-700 dark:text-gray-200"><BlurMoney amount={finalInvested} privacyMode={privacyMode} /></div></div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800"><div className="text-sm text-blue-800 dark:text-blue-300 mb-1">Final (Scénario Cible)</div><div className="text-2xl font-bold text-blue-700 dark:text-blue-400"><BlurMoney amount={finalTarget} privacyMode={privacyMode} /></div></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MovementsGlobalView = ({ brokers, privacyMode }) => {
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 12);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    const allMovements = useMemo(() => {
        const moves = [];
        brokers.forEach(broker => {
            broker.accounts.forEach(account => {
                if (account.movements) {
                    account.movements.forEach(m => {
                        moves.push({
                            ...m,
                            brokerName: broker.name,
                            accountName: account.name,
                            currency: account.currency || 'EUR',
                            exchangeRate: parseFloat(account.exchangeRate || 1)
                        });
                    });
                }
            });
        });
        return moves.sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [brokers]);

    const filteredMovements = useMemo(() => {
        return allMovements.filter(m => m.date >= startDate && m.date <= endDate);
    }, [allMovements, startDate, endDate]);

    const stats = useMemo(() => {
        const s = { deposit: 0, withdrawal: 0, interest: 0, net: 0 };
        filteredMovements.forEach(m => {
            const amountEur = parseFloat(m.amount) * m.exchangeRate;
            if (m.type === 'deposit') s.deposit += amountEur;
            else if (m.type === 'withdrawal') s.withdrawal += amountEur;
            else if (m.type === 'interest') s.interest += amountEur;
        });
        s.net = s.deposit - s.withdrawal;
        return s;
    }, [filteredMovements]);

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-lg text-white"><History className="w-6 h-6" /></div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Récapitulatif des Mouvements</h2>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Du</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none text-sm font-bold outline-none dark:text-white" />
                    </div>
                    <div className="w-px h-4 bg-gray-200 dark:bg-slate-700 mx-1"></div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Au</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none text-sm font-bold outline-none dark:text-white" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-1">Total Versé</div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400"><BlurMoney amount={stats.deposit} privacyMode={privacyMode} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-1">Total Retiré</div>
                    <div className="text-xl font-bold text-red-600 dark:text-red-400"><BlurMoney amount={stats.withdrawal} privacyMode={privacyMode} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-1">Flux Net</div>
                    <div className={`text-xl font-bold ${stats.net >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-500'}`}><BlurMoney amount={stats.net} privacyMode={privacyMode} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-1">Dividendes</div>
                    <div className="text-xl font-bold text-amber-500"><BlurMoney amount={stats.interest} privacyMode={privacyMode} /></div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-gray-300 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="p-4 text-center">Type</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Compte</th>
                                <th className="p-4 text-right">Montant</th>
                                <th className="p-4 text-right">En EUR</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {filteredMovements.length > 0 ? filteredMovements.map((m, i) => {
                                const symbol = CURRENCIES.find(c => c.code === m.currency)?.symbol || '€';
                                const isDeposit = m.type === 'deposit';
                                const isInterest = m.type === 'interest';
                                const amountEur = parseFloat(m.amount) * m.exchangeRate;
                                
                                return (
                                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="p-4 text-center">
                                            <div className={`inline-flex p-1.5 rounded-full ${isDeposit ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : isInterest ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-red-100 text-red-600 dark:bg-red-900/30'}`}>
                                                {isDeposit ? <ArrowUpCircle className="w-4 h-4" /> : isInterest ? <Percent className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                                            </div>
                                        </td>
                                        <td className="p-4 font-medium text-gray-600 dark:text-gray-400">{new Date(m.date).toLocaleDateString('fr-FR')}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-800 dark:text-white text-xs">{m.brokerName}</div>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">{m.accountName}</div>
                                        </td>
                                        <td className={`p-4 text-right font-bold ${isDeposit ? 'text-green-600' : isInterest ? 'text-amber-500' : 'text-red-500'}`}>
                                            {isDeposit ? '+' : isInterest ? '+' : '-'}<BlurMoney amount={parseFloat(m.amount)} currency={symbol} privacyMode={privacyMode} />
                                        </td>
                                        <td className="p-4 text-right font-bold text-gray-900 dark:text-white">
                                            <BlurMoney amount={amountEur} privacyMode={privacyMode} />
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan="5" className="p-10 text-center text-gray-400 italic">Aucun mouvement sur cette période</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const HistoryView = ({ brokers, darkMode, privacyMode }) => {
    const [selectedYear, setSelectedYear] = useState('all');
    const fullStats = useMemo(() => processMonthlyStats(brokers), [brokers]);

    const years = useMemo(() => {
        const y = [...new Set(fullStats.map(s => s.month.split('-')[0]))];
        return y.sort((a, b) => b - a);
    }, [fullStats]);

    const stats = useMemo(() => {
        if (selectedYear === 'all') return fullStats;
        return fullStats.filter(s => s.month.startsWith(selectedYear));
    }, [fullStats, selectedYear]);

    const periodStats = useMemo(() => {
        if (!stats.length) return null;
        const totalGain = stats.reduce((acc, s) => acc + s.performance, 0);
        const totalFlows = stats.reduce((acc, s) => acc + s.flow, 0);
        
        // Rendement cumulé (TWR) : on multiplie les (1 + yield) de chaque mois
        const cumulativeYield = (stats.reduce((acc, s) => acc * (1 + (s.yield / 100)), 1) - 1) * 100;
        
        return { totalGain, totalFlows, cumulativeYield };
    }, [stats]);

    if (!fullStats.length) return <div className="text-center py-20"><History className="w-16 h-16 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Ajoutez des valorisations pour voir l'historique.</p></div>;

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-5xl mx-auto">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                    <div className="bg-orange-500 p-2 rounded-lg text-white"><Calendar className="w-6 h-6" /></div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Rapport Mensuel</h2>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-bold text-gray-500 dark:text-gray-400">Année :</label>
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    >
                        <option value="all">Toutes les années</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {periodStats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                        <div className="text-xs font-bold text-gray-400 uppercase mb-1">Gain/Perte Période</div>
                        <div className={`text-xl font-bold ${periodStats.totalGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                            {periodStats.totalGain > 0 ? '+' : ''}<BlurMoney amount={periodStats.totalGain} privacyMode={privacyMode} />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                        <div className="text-xs font-bold text-gray-400 uppercase mb-1">Rendement Cumulé</div>
                        <div className={`text-xl font-bold ${periodStats.cumulativeYield >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-500'}`}>
                            {periodStats.cumulativeYield > 0 ? '+' : ''}{periodStats.cumulativeYield.toFixed(2)}%
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                        <div className="text-xs font-bold text-gray-400 uppercase mb-1">Flux Net Période</div>
                        <div className="text-xl font-bold text-gray-700 dark:text-gray-200">
                            {periodStats.totalFlows > 0 ? '+' : ''}<BlurMoney amount={periodStats.totalFlows} privacyMode={privacyMode} />
                        </div>
                    </div>
                </div>
            )}

             <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                <h3 className="font-bold mb-4 text-gray-800 dark:text-white">Performance Nette par Mois (€)</h3>
                <div className="h-80">
    <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={stats}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="displayDate" fontSize={12} stroke="#9CA3AF" />
            <YAxis yAxisId="left" fontSize={12} stroke="#9CA3AF" tickFormatter={v => privacyMode ? '***' : `${(v).toFixed(0)}€`} />
            <YAxis yAxisId="right" orientation="right" fontSize={12} stroke="#F59E0B" tickFormatter={v => `${v.toFixed(1)}%`} />
            <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#fff' : '#000', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value, name) => {
                    if (name === "Rendement") return [`${value.toFixed(2)} %`, name];
                    return [privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value), name];
                }}
            />
            <Legend />
            <ReferenceLine y={0} yAxisId="left" stroke="#9CA3AF" />
            <Bar yAxisId="left" dataKey="performance" name="Gain/Perte Net" fill="#3B82F6" barSize={40}>
                {stats.map((entry, index) => (<cell key={`cell-${index}`} fill={entry.performance >= 0 ? '#10B981' : '#EF4444'} />))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="yield" name="Rendement" stroke="#F59E0B" strokeWidth={3} dot={{r: 4, fill: '#F59E0B'}} />
        </ComposedChart>
    </ResponsiveContainer>
</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-gray-300 font-bold">
                            <tr><th className="p-4">Mois</th><th className="p-4 text-right">Valeur Fin</th><th className="p-4 text-right">Investi Total</th><th className="p-4 text-right">Flux Mois</th><th className="p-4 text-right">Variation</th><th className="p-4 text-right">Perf. Nette</th><th className="p-4 text-right">Rendement</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {[...stats].reverse().map((stat, i) => (
                                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="p-4 font-bold text-gray-800 dark:text-white">{stat.displayDate}</td>
                                    <td className="p-4 text-right font-medium text-gray-900 dark:text-white"><BlurMoney amount={stat.value} privacyMode={privacyMode} /></td>
                                    <td className="p-4 text-right text-gray-500 dark:text-gray-400"><BlurMoney amount={stat.invested} privacyMode={privacyMode} /></td>
                                    <td className={`p-4 text-right font-medium ${stat.flow > 0 ? 'text-blue-600' : stat.flow < 0 ? 'text-orange-500' : 'text-gray-400'}`}>{stat.flow > 0 ? '+' : ''}{stat.flow !== 0 ? <BlurMoney amount={stat.flow} privacyMode={privacyMode} /> : '-'}</td>
                                    <td className="p-4 text-right text-gray-500 dark:text-gray-400">{stat.variation > 0 ? '+' : ''}<BlurMoney amount={stat.variation} privacyMode={privacyMode} /></td>
                                    <td className={`p-4 text-right font-bold ${stat.performance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{stat.performance > 0 ? '+' : ''}<BlurMoney amount={stat.performance} privacyMode={privacyMode} /></td>
                                    <td className={`p-4 text-right font-bold ${stat.yield >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{stat.yield > 0 ? '+' : ''}{stat.yield.toFixed(2)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- APP PRINCIPALE ---

const InvestmentTrackerApp = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [privacyMode, setPrivacyMode] = useState(false);

  const [brokers, setBrokers] = useState([]);
  const [patrimonyGoal, setPatrimonyGoal] = useState(100000);
  const [targetAllocation, setTargetAllocation] = useState({});

  const [selectedBroker, setSelectedBroker] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [view, setView] = useState('dashboard');
  const [notification, setNotification] = useState({ message: '', type: 'success' });
  const [modals, setModals] = useState({ broker: false, account: false, snapshot: false, goal: false, movement: false, movementList: false, allocation: false, transfer: false });
  const [editData, setEditData] = useState(null);
  const fileInputRef = useRef(null);
  const [sortConfig, setSortConfig] = useState({ key: 'value', direction: 'desc' });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
            await loadUserData(currentUser.uid);
        }
        setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadUserData = async (uid) => {
      setDataLoading(true);
      try {
          const docRef = doc(db, "users", uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              const data = docSnap.data();
              setBrokers(data.brokers || []);
              setPatrimonyGoal(data.patrimonyGoal || 100000);
              setTargetAllocation(data.targetAllocation || {});
          }
      } catch (e) {
          showToast("Erreur chargement données", "error");
          console.error(e);
      }
      setDataLoading(false);
  };

  const saveUserData = async (newBrokers, newGoal, newAllocation) => {
      if (!user) return;
      setSaving(true);
      try {
          const dataToSave = {
              brokers: newBrokers !== undefined ? newBrokers : brokers,
              patrimonyGoal: newGoal !== undefined ? newGoal : patrimonyGoal,
              targetAllocation: newAllocation !== undefined ? newAllocation : targetAllocation,
              lastUpdated: new Date().toISOString()
          };
          await setDoc(doc(db, "users", user.uid), dataToSave, { merge: true });
          if(newBrokers !== undefined) setBrokers(newBrokers);
          if(newGoal !== undefined) setPatrimonyGoal(newGoal);
          if(newAllocation !== undefined) setTargetAllocation(newAllocation);
      } catch (e) {
          showToast("Erreur sauvegarde", "error");
          console.error(e);
      }
      setSaving(false);
  };

  const handleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (error) { showToast("Erreur connexion", "error"); } };
  const handleLogout = async () => { await signOut(auth); setBrokers([]); setUser(null); };

  const handleResetData = async () => {
    if (window.confirm("ATTENTION : Vous êtes sur le point d'effacer TOUTES vos données (Courtiers, comptes, mouvements...).")) {
        if (window.confirm("C'est irréversible. Êtes-vous vraiment sûr de vouloir tout supprimer et repartir à zéro ?")) {
            await saveUserData([], 100000, {});
            setSelectedBroker(null);
            setSelectedAccount(null);
            setView('dashboard');
            showToast("Données réinitialisées avec succès");
        }
    }
  };

  // --- HELPERS CSV & EXPORT/IMPORT ---

  // Helper : Parser le CSV pour reconstruire la structure des données
  const parseCSV = (csvText) => {
    const lines = csvText.split('\n');
    const brokersMap = new Map();

    lines.slice(1).forEach((line, index) => {
        if (!line.trim()) return;
        const cols = line.split(';');
        if (cols.length < 8) return;

        const [date, brokerName, accountName, accType, nature, category, amountStr, currency] = cols;
        const amount = parseFloat(amountStr);

        // 1. Courtier
        if (!brokersMap.has(brokerName)) {
            brokersMap.set(brokerName, { 
                id: Date.now() + index, 
                name: brokerName, 
                accounts: [] 
            });
        }
        const broker = brokersMap.get(brokerName);

        // 2. Compte
        let account = broker.accounts.find(a => a.name === accountName);
        if (!account) {
            account = { 
                id: Date.now() + index + 10000, 
                name: accountName, 
                type: accType,
                currency: currency || 'EUR', 
                movements: [], 
                snapshots: [] 
            };
            broker.accounts.push(account);
        }

        // 3. Donnée
        if (nature.startsWith('Mouvement')) {
            const typeMatch = nature.match(/\((.*?)\)/);
            const moveType = typeMatch ? typeMatch[1] : 'deposit';
            
            account.movements.push({
                id: Date.now() + index + 20000,
                date: date,
                amount: amount,
                type: moveType
            });
        } else if (nature === 'Valorisation') {
            let snap = account.snapshots.find(s => s.date === date);
            if (!snap) {
                snap = { 
                    id: Date.now() + index + 30000, 
                    date: date, 
                    amount: 0, 
                    categories: [] 
                };
                account.snapshots.push(snap);
            }
            snap.categories.push({ type: category, amount: amount });
            // Mise à jour du total
            snap.amount = (parseFloat(snap.amount) + amount).toFixed(2);
        }
    });

    return Array.from(brokersMap.values());
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date;Courtier;Compte;TypeCompte;Nature;Categorie;Montant;Devise\n";

    brokers.forEach(broker => {
        broker.accounts.forEach(account => {
            const currency = account.currency || 'EUR';
            const accType = account.type || 'Autre';
            
            if(account.snapshots) {
                account.snapshots.forEach(snap => {
                    snap.categories.forEach(cat => {
                        csvContent += `${snap.date};${broker.name};${account.name};${accType};Valorisation;${cat.type};${cat.amount};${currency}\n`;
                    });
                });
            }
            
            if(account.movements) {
                account.movements.forEach(move => {
                    csvContent += `${move.date};${broker.name};${account.name};${accType};Mouvement (${move.type});-;${move.amount};${currency}\n`;
                });
            }
        });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mon_patrimoine_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { 
        try { 
            const content = ev.target.result;
            if (file.name.endsWith('.csv')) {
                // IMPORT CSV
                if(window.confirm('⚠️ Import CSV détecté.\nCela va REMPLACER toutes vos données par le contenu du fichier CSV.\nVoulez-vous continuer ?')) {
                    const newBrokers = parseCSV(content);
                    // On garde l'objectif et l'alloc actuels car non présents dans le CSV
                    saveUserData(newBrokers, patrimonyGoal, targetAllocation); 
                    showToast('Import CSV réussi'); 
                }
            } else {
                // IMPORT JSON
                const json = JSON.parse(content); 
                if(window.confirm('Remplacer les données Firebase par ce fichier de sauvegarde JSON ?')) { 
                    saveUserData(json.brokers || [], json.patrimonyGoal || 100000, json.targetAllocation || {}); 
                    showToast('Import JSON réussi'); 
                } 
            }
        } catch (err) { 
            console.error(err);
            showToast('Fichier invalide', 'error'); 
        } 
        if(fileInputRef.current) fileInputRef.current.value = ''; 
    };
    reader.readAsText(file);
  };

  const handleExport = () => { const blob = new Blob([JSON.stringify({ brokers, patrimonyGoal, targetAllocation, version: "1.21" }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup_cloud_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); };

  const showToast = (message, type = 'success') => setNotification({ message, type });
  const getLatestSnapshot = (acc) => acc.snapshots?.length ? acc.snapshots[acc.snapshots.length - 1] : null;
  const getAccountCurrentValueRaw = (acc) => { const last = getLatestSnapshot(acc); return last ? parseFloat(last.amount) : 0; };
  const getAccountCurrentValueInEur = (acc) => { const raw = getAccountCurrentValueRaw(acc); const rate = parseFloat(acc.exchangeRate || 1); return raw * rate; };
  
  const getAccountInvestedTotalRaw = (acc) => {
      return getNetInvestedUntilDate(acc.movements, new Date().toISOString());
  };
  const getAccountInvestedAmountInEur = (acc) => { const inv = getAccountInvestedTotalRaw(acc); const rate = parseFloat(acc.exchangeRate || 1); return inv * rate; };
  
  const totalPatrimony = useMemo(() => brokers.reduce((sum, b) => sum + b.accounts.reduce((s, a) => s + getAccountCurrentValueInEur(a), 0), 0), [brokers]);
  const totalInvestedGlobal = useMemo(() => brokers.reduce((sum, b) => sum + b.accounts.reduce((s, a) => s + getAccountInvestedAmountInEur(a), 0), 0), [brokers]);
  const totalNetGainLoss = useMemo(() => totalPatrimony - totalInvestedGlobal, [totalPatrimony, totalInvestedGlobal]);
  const getTotalByBrokerInEur = (b) => b.accounts.reduce((sum, a) => sum + getAccountCurrentValueInEur(a), 0);

  const performanceStats = useMemo(() => {
    let allMovements = []; 
    let allSnapshots = [];
    let currentTotalValue = 0;
    
    brokers.forEach(b => {
        b.accounts.forEach(a => {
            const rate = parseFloat(a.exchangeRate || 1);
            const currentValRaw = getAccountCurrentValueRaw(a);
            currentTotalValue += currentValRaw * rate;
            
            if(a.movements) {
                const movesEur = a.movements.map(m => ({ 
                    ...m, 
                    amount: parseFloat(m.amount) * rate,
                    preValuation: m.preValuation ? parseFloat(m.preValuation) * rate : null
                }));
                allMovements = [...allMovements, ...movesEur];
            }
            
            if(a.snapshots) {
                const snapsEur = a.snapshots.map(s => ({
                    ...s,
                    amount: parseFloat(s.amount) * rate
                }));
                allSnapshots = [...allSnapshots, ...snapsEur];
            }
        });
    });
    
    // Pour le TWR global, on regroupe les snapshots par date
    const globalSnapshotsMap = {};
    allSnapshots.forEach(s => {
        globalSnapshotsMap[s.date] = (globalSnapshotsMap[s.date] || 0) + s.amount;
    });
    const globalSnapshots = Object.entries(globalSnapshotsMap).map(([date, amount]) => ({ date, amount }));

    return {
        tri: calculateXIRR(allMovements, currentTotalValue),
        twr: calculateTWR(allMovements, globalSnapshots, currentTotalValue)
    };
  }, [brokers]);

  const globalTRI = performanceStats.tri;
  const globalTWR = performanceStats.twr;

  const getSortedAccounts = (accounts, broker) => {
    const sortableAccounts = accounts.map(acc => ({
        ...acc,
        currentValueEur: getAccountCurrentValueInEur(acc),
        investedTotalEur: getAccountInvestedAmountInEur(acc),
        tri: calculateXIRR(acc.movements, getAccountCurrentValueRaw(acc)),
        twr: calculateTWR(acc.movements || [], acc.snapshots || [], getAccountCurrentValueRaw(acc))
    }));
    return [...sortableAccounts].sort((a, b) => {
      let aValue = 0, bValue = 0;
      switch (sortConfig.key) {
        case 'name': return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        case 'type': return sortConfig.direction === 'asc' ? a.type.localeCompare(b.type) : b.type.localeCompare(a.type);
        case 'value': aValue = a.currentValueEur; bValue = b.currentValueEur; break;
        case 'performance':
            const aPerf = a.investedTotalEur > 0 ? (a.currentValueEur - a.investedTotalEur) / a.investedTotalEur : 0;
            const bPerf = b.investedTotalEur > 0 ? (b.currentValueEur - b.investedTotalEur) / b.investedTotalEur : 0;
            aValue = aPerf; bValue = bPerf; break;
        default: return 0;
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const globalCategoryDistribution = useMemo(() => {
    const dist = {};
    brokers.forEach(b => {
      b.accounts.forEach(acc => {
        const last = getLatestSnapshot(acc);
        const rate = parseFloat(acc.exchangeRate || 1);
        if (last?.categories) last.categories.forEach(c => {
          const v = parseFloat(c.amount || 0) * rate;
          if (!dist[c.type]) dist[c.type] = { value: 0, accounts: [] };
          dist[c.type].value += v;
          dist[c.type].accounts.push({
            brokerName: b.name,
            accountName: acc.name,
            accountId: acc.id,
            value: v,
            currency: acc.currency || 'EUR'
          });
        });
      });
    });

    const absTotal = Object.values(dist).reduce((a, b) => a + Math.abs(b.value), 0);
    return Object.entries(dist).map(([k, data]) => {
      const i = INVESTMENT_CATEGORIES.find(c => c.value === k);
      return {
        label: i?.label || k,
        value: data.value,
        color: i?.color || '#999',
        percentage: absTotal ? (Math.abs(data.value) / absTotal * 100).toFixed(1) : 0,
        type: k,
        accounts: data.accounts.sort((a, b) => b.value - a.value)
      };
    }).sort((a, b) => b.value - a.value);
  }, [brokers]);

  const crossDistributionData = useMemo(() => {
      const allAccountIds = [...new Set(brokers.flatMap(b => b.accounts.map(a => a.id)))];
      const accountNames = {};
      brokers.forEach(b => b.accounts.forEach(a => accountNames[a.id] = `${b.name} - ${a.name}`));

      return globalCategoryDistribution.map(cat => {
          const row = { name: cat.label, total: cat.value };
          cat.accounts.forEach(acc => {
              row[acc.accountId] = acc.value;
          });
          return row;
      });
  }, [globalCategoryDistribution, brokers]);

  const globalAccountTypeDistribution = useMemo(() => {
    const dist = {};
    brokers.flatMap(b => b.accounts).forEach(acc => {
      const val = getAccountCurrentValueInEur(acc);
      const type = acc.type || 'Autre';
      dist[type] = (dist[type] || 0) + val;
    });
    const absTotal = Object.values(dist).reduce((a, b) => a + Math.abs(b), 0);
    return Object.entries(dist).map(([k, v]) => {
      const t = ACCOUNT_TYPES.find(type => type.value === k);
      return { label: t?.label || k, value: v, color: t?.color || '#9CA3AF', percentage: absTotal ? (Math.abs(v)/absTotal*100).toFixed(1) : 0, type: k };
    }).sort((a, b) => b.value - a.value);
  }, [brokers]);

  const openModal = (type, data = null) => { 
      setEditData(data);
      setModals({ broker: false, account: false, snapshot: false, goal: false, movement: false, movementList: false, allocation: false, transfer: false, [type]: true }); 
  };
  const closeModal = () => { setModals({ broker: false, account: false, snapshot: false, goal: false, movement: false, movementList: false, allocation: false, transfer: false }); setEditData(null); };

  const handleSaveBroker = (name) => {
    const newBrokers = editData ? brokers.map(b => b.id === editData.id ? { ...b, name } : b) : [...brokers, { id: Date.now(), name, accounts: [], createdAt: new Date().toISOString() }];
    saveUserData(newBrokers, undefined, undefined); showToast('Courtier enregistré'); closeModal();
  };
  const deleteBroker = (id) => { if (window.confirm('Supprimer ?')) { const newBrokers = brokers.filter(b => b.id !== id); saveUserData(newBrokers, undefined, undefined); if(selectedBroker?.id === id) { setSelectedBroker(null); setView('dashboard'); } showToast('Courtier supprimé'); }};
  const handleSaveAccount = (brokerId, data) => {
    const updated = [...brokers]; const idx = updated.findIndex(b => b.id === brokerId); if(idx === -1) return;
    if(editData) updated[idx].accounts = updated[idx].accounts.map(a => a.id === editData.id ? {...a, ...data} : a);
    else updated[idx].accounts.push({...data, id: Date.now(), snapshots: [], movements: []});
    saveUserData(updated, undefined, undefined); setSelectedBroker(updated[idx]); if(editData && selectedAccount?.id === editData.id) setSelectedAccount(updated[idx].accounts.find(a => a.id === editData.id)); showToast('Compte enregistré'); closeModal();
  };
  const deleteAccount = (brokerId, accountId) => { if(window.confirm('Supprimer ?')) { const updated = brokers.map(b => b.id === brokerId ? {...b, accounts: b.accounts.filter(a => a.id !== accountId)} : b); saveUserData(updated, undefined, undefined); const ub = updated.find(b => b.id === brokerId); if(selectedBroker?.id === brokerId) setSelectedBroker(ub); if(selectedAccount?.id === accountId) { setSelectedAccount(null); setView('accounts'); } showToast('Compte supprimé'); }};
  const handleSaveSnapshot = (brokerId, accountId, data) => {
    const total = data.categories.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
    const newSnap = { ...data, amount: total.toFixed(2), id: data.id || Date.now() };
    const updated = brokers.map(b => b.id !== brokerId ? b : { ...b, accounts: b.accounts.map(a => a.id !== accountId ? a : { ...a, snapshots: data.id ? a.snapshots.map(s => s.id === data.id ? newSnap : s).sort((x, y) => new Date(x.date) - new Date(y.date)) : [...(a.snapshots || []), newSnap].sort((x, y) => new Date(x.date) - new Date(y.date)) }) });
    saveUserData(updated, undefined, undefined); const ub = updated.find(b => b.id === brokerId); setSelectedBroker(ub); setSelectedAccount(ub.accounts.find(a => a.id === accountId)); showToast(data.id ? 'Valorisation modifiée' : 'Valorisation ajoutée'); closeModal();
  };
  const deleteSnapshot = (brokerId, accountId, snapId) => { if(window.confirm('Supprimer ?')) { const updated = brokers.map(b => b.id !== brokerId ? b : { ...b, accounts: b.accounts.map(a => a.id !== accountId ? a : { ...a, snapshots: a.snapshots.filter(s => s.id !== snapId) }) }); saveUserData(updated, undefined, undefined); const ub = updated.find(b => b.id === brokerId); setSelectedBroker(ub); setSelectedAccount(ub.accounts.find(a => a.id === accountId)); showToast('Valorisation supprimée'); }};
  const handleSaveMovement = (data) => {
      let capitalPart = null;
      if (data.type === 'withdrawal') {
         const currentInvested = getAccountInvestedTotalRaw(selectedAccount);
         const valueBefore = parseFloat(data.preValuation);
         const withdrawAmount = parseFloat(data.amount);
         if (valueBefore > 0 && currentInvested > 0) {
             const ratio = withdrawAmount / valueBefore;
             capitalPart = currentInvested * ratio;
             if (capitalPart > currentInvested) capitalPart = currentInvested; 
         } else capitalPart = withdrawAmount;
      }
      const newMove = { ...data, capitalPart, id: data.id || Date.now() };
      const updated = brokers.map(b => b.id !== selectedBroker.id ? b : { ...b, accounts: b.accounts.map(a => a.id !== selectedAccount.id ? a : { ...a, movements: data.id ? a.movements.map(m => m.id === data.id ? newMove : m).sort((x, y) => new Date(y.date) - new Date(x.date)) : [...(a.movements || []), newMove].sort((x, y) => new Date(y.date) - new Date(x.date)) }) });
      saveUserData(updated, undefined, undefined); const ub = updated.find(b => b.id === selectedBroker.id); setSelectedBroker(ub); setSelectedAccount(ub.accounts.find(a => a.id === selectedAccount.id)); showToast(data.id ? 'Mouvement modifié' : 'Mouvement ajouté'); closeModal(); openModal('movementList');
  };
  const deleteMovement = (moveId) => { if(window.confirm('Supprimer ?')) { const updated = brokers.map(b => b.id !== selectedBroker.id ? b : { ...b, accounts: b.accounts.map(a => a.id !== selectedAccount.id ? a : { ...a, movements: a.movements.filter(m => m.id !== moveId) }) }); saveUserData(updated, undefined, undefined); const ub = updated.find(b => b.id === selectedBroker.id); setSelectedBroker(ub); setSelectedAccount(ub.accounts.find(a => a.id === selectedAccount.id)); }};
  const handleSaveTransfer = (data) => {
    let withdrawalCapitalPart = parseFloat(data.amount); 
    const sourceAccount = brokers.flatMap(b => b.accounts).find(a => a.id == data.sourceId);
    if (sourceAccount) {
        const currentInvested = getAccountInvestedTotalRaw(sourceAccount);
        const valueBefore = parseFloat(data.preValuation);
        const withdrawAmount = parseFloat(data.amount);
        if (valueBefore > 0 && currentInvested > 0) {
            const ratio = withdrawAmount / valueBefore;
            withdrawalCapitalPart = currentInvested * ratio;
            if (withdrawalCapitalPart > currentInvested) withdrawalCapitalPart = currentInvested;
        }
    }
    const withdrawal = { id: Date.now(), date: data.date, amount: data.amount, type: 'withdrawal', capitalPart: withdrawalCapitalPart };
    const deposit = { id: Date.now() + 1, date: data.date, amount: data.amount, type: 'deposit' };
    const updated = brokers.map(b => {
        const newAccounts = b.accounts.map(a => {
            if (a.id == data.sourceId) return { ...a, movements: [...(a.movements || []), withdrawal].sort((x, y) => new Date(y.date) - new Date(x.date)) };
            if (a.id == data.targetId) return { ...a, movements: [...(a.movements || []), deposit].sort((x, y) => new Date(y.date) - new Date(x.date)) };
            return a;
        });
        return { ...b, accounts: newAccounts };
    });
    saveUserData(updated, undefined, undefined); showToast('Transfert effectué'); closeModal();
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><Loader2 className="w-10 h-10 text-blue-600 animate-spin" /></div>;
  if (!user) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4"><div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 max-w-md w-full text-center"><div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6"><Wallet className="w-10 h-10 text-blue-600 dark:text-blue-400" /></div><h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Mon Patrimoine</h1><p className="text-gray-500 dark:text-gray-400 mb-8">Connectez-vous pour synchroniser vos investissements.</p><button onClick={handleLogin} disabled={authLoading} className="w-full bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-white font-bold py-3 px-4 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-3 shadow-sm">Continuer avec Google</button></div></div>;

  const BrokersView = () => (
    <div className="space-y-6 w-full animate-fade-in">
        <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-gray-800 dark:text-white">Mes Courtiers</h2><button onClick={() => openModal('broker')} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-lg font-medium transition-transform active:scale-95"><PlusCircle className="w-5 h-5" /> Ajouter</button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">{brokers.map(b => (<div key={b.id} onClick={() => { setSelectedBroker(b); setView('accounts'); }} className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg hover:shadow-2xl cursor-pointer group relative overflow-hidden transition-all"><div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 dark:bg-slate-700 rounded-bl-full -mr-12 -mt-12 group-hover:scale-110 transition-transform"></div><div className="relative flex justify-between items-start mb-6"><div className="flex items-center gap-3"><div className="p-3 bg-blue-50 dark:bg-slate-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><Building2 className="w-6 h-6 dark:text-blue-300 group-hover:text-white" /></div><h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 truncate max-w-[150px]">{b.name}</h3></div><div className="flex gap-1 z-10"><button onClick={e => { e.stopPropagation(); openModal('broker', b); }} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"><Edit2 className="w-4 h-4" /></button><button onClick={e => { e.stopPropagation(); deleteBroker(b.id); }} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 className="w-4 h-4" /></button></div></div><div className="relative"><div className="text-3xl font-bold text-gray-900 dark:text-white"><BlurMoney amount={getTotalByBrokerInEur(b)} privacyMode={privacyMode} /></div><div className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">{b.accounts.length} compte(s)</div></div></div>))}</div>{!brokers.length && <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700"><Building2 className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" /><p className="text-gray-500 dark:text-gray-400 font-medium">Aucun courtier enregistré</p></div>}
    </div>
  );
  const AccountsView = () => {
    const sortedAccounts = getSortedAccounts(selectedBroker.accounts, selectedBroker);
    return (
      <div className="space-y-6 w-full animate-fade-in">
        <div className="flex items-center gap-4"><button onClick={() => { setView('brokers'); setSelectedBroker(null); }} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300"><ArrowLeft className="w-6 h-6" /></button><div><h2 className="text-2xl font-bold text-gray-800 dark:text-white">{selectedBroker.name}</h2></div></div>
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-2xl text-white shadow-xl flex justify-between items-center"><div><div className="text-blue-100 font-medium mb-2">Valorisation totale (EUR)</div><div className="text-5xl font-bold"><BlurMoney amount={getTotalByBrokerInEur(selectedBroker)} privacyMode={privacyMode} /></div></div><div className="hidden sm:block p-4 bg-white/10 rounded-2xl"><Wallet className="w-12 h-12 text-white" /></div></div>
        <div className="flex justify-between items-center mt-8"><h3 className="text-xl font-bold text-gray-800 dark:text-white">Comptes</h3><div className="flex items-center gap-3"><button onClick={() => openModal('account')} className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-4 py-2 rounded-lg shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"><PlusCircle className="w-5 h-5 text-blue-600" /> Nouveau compte</button></div></div>
        <div className="grid gap-4">{sortedAccounts.map(acc => { const type = ACCOUNT_TYPES.find(t => t.value === acc.type); const currency = acc.currency || 'EUR'; const symbol = CURRENCIES.find(c => c.code === currency)?.symbol || '€'; const investedTotal = getAccountInvestedTotalRaw(acc); return (<div key={acc.id} onClick={() => { setSelectedAccount(acc); setView('snapshots'); }} className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg hover:shadow-xl cursor-pointer flex justify-between items-center group transition-all"><div className="flex items-center gap-5"><div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gray-50 dark:bg-slate-700 border dark:border-slate-600" style={{color: type?.color}}><Wallet className="w-7 h-7" /></div><div><div className="flex items-center gap-3 mb-1"><h4 className="font-bold text-lg text-gray-900 dark:text-white">{acc.name}</h4><span className="text-xs bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-300 font-medium border dark:border-slate-600">{type?.label}</span>{currency !== 'EUR' && <span className="text-xs bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 px-2 py-0.5 rounded-full text-orange-700 dark:text-orange-300 font-bold">{currency}</span>}</div><div className="flex items-baseline gap-3"><span className="text-xl font-bold text-gray-800 dark:text-gray-200"><BlurMoney amount={getAccountCurrentValueRaw(acc)} currency={symbol} privacyMode={privacyMode} /></span><PerformanceBadge current={getAccountCurrentValueRaw(acc)} invested={investedTotal} tri={acc.tri} /></div></div></div><div className="flex items-center gap-2"><button onClick={e => { e.stopPropagation(); openModal('account', acc); }} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"><Edit2 className="w-4 h-4" /></button><button onClick={e => { e.stopPropagation(); deleteAccount(selectedBroker.id, acc.id); }} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400"><Trash2 className="w-4 h-4" /></button><ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-500 ml-2" /></div></div>); })}</div>
      </div>
    );
  };
  const SnapshotsView = () => {
    const snapshots = selectedAccount.snapshots || []; 
    const currentVal = getAccountCurrentValueRaw(selectedAccount); 
    const investedVal = getAccountInvestedTotalRaw(selectedAccount); 
    const lastSnap = getLatestSnapshot(selectedAccount); 
    
    const chartData = snapshots.map(s => ({ 
        date: new Date(s.date).toLocaleDateString('fr-FR', {month:'short', year:'2-digit'}), 
        val: parseFloat(s.amount),
        invested: getNetInvestedUntilDate(selectedAccount.movements || [], s.date)
    })); 
    
    const dist = lastSnap?.categories?.map(c => ({ ...c, ...(INVESTMENT_CATEGORIES.find(i => i.value === c.type)) })).sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)) || []; 
    const currency = selectedAccount.currency || 'EUR'; 
    const symbol = CURRENCIES.find(c => c.code === currency)?.symbol || '€'; 
    const tri = calculateXIRR(selectedAccount.movements, currentVal);
    const twr = calculateTWR(selectedAccount.movements || [], selectedAccount.snapshots || [], currentVal);

    return (<div className="space-y-6 animate-fade-in w-full"><div className="flex items-center gap-4"><button onClick={() => { setView('accounts'); setSelectedAccount(null); }} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300"><ArrowLeft className="w-6 h-6" /></button><div><div className="flex items-center gap-2"><h2 className="text-2xl font-bold text-gray-800 dark:text-white">{selectedAccount.name}</h2>{currency !== 'EUR' && <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 text-xs font-bold rounded">{currency}</span>}</div><p className="text-gray-500 dark:text-gray-400">{selectedBroker.name}</p></div></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg"><div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Valeur Actuelle</div><div className="text-2xl font-bold text-gray-900 dark:text-white"><BlurMoney amount={currentVal} currency={symbol} privacyMode={privacyMode} /></div></div><div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-500 group" onClick={() => openModal('movementList')}><div className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center justify-between">Capital Investi <Edit2 className="w-3 h-3 text-gray-300 group-hover:text-blue-500 transition-colors" /></div><div className="text-2xl font-bold text-gray-900 dark:text-white"><BlurMoney amount={investedVal} currency={symbol} privacyMode={privacyMode} /></div></div><div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg"><div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Plus/Moins Value</div><div className="text-2xl font-bold text-gray-900 dark:text-white">{investedVal > 0 ? (currentVal - investedVal > 0 ? '+' : '') : ''} <BlurMoney amount={investedVal > 0 ? (currentVal - investedVal) : 0} currency={symbol} privacyMode={privacyMode} /></div></div><div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg"><div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Performance</div><div className="text-2xl font-bold flex items-center"><PerformanceBadge current={currentVal} invested={investedVal} tri={tri} twr={twr} /></div></div></div><div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-1 bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg h-fit"><h3 className="font-bold mb-4 text-gray-800 dark:text-white">Allocation</h3>{dist.length > 0 ? (<div className="space-y-3 pt-2">{dist.map((d, i) => (<div key={i} className="flex justify-between items-center text-sm"><span className="flex items-center text-gray-600 dark:text-gray-300 font-medium"><div className="w-2 h-2 rounded-full mr-3" style={{backgroundColor: d.color}}></div>{d.label}</span><span className="font-bold text-gray-800 dark:text-white"><BlurMoney amount={parseFloat(d.amount)} currency={symbol} privacyMode={privacyMode} /></span></div>))}</div>) : <p className="text-gray-400 text-sm">Pas de données</p>}</div><div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg"><h3 className="font-bold mb-6 text-gray-800 dark:text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Évolution ({currency})</h3><div className="h-72">{chartData.length > 1 ? (<ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" /><XAxis dataKey="date" fontSize={12} stroke="#9CA3AF" /><YAxis domain={['dataMin', 'dataMax']} fontSize={12} stroke="#9CA3AF" tickFormatter={v => privacyMode ? '***' : `${(v/1000).toFixed(0)}k`} /><Tooltip contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#fff' : '#000'}} formatter={(value) => privacyMode ? '****' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)} /><Legend /><Line isAnimationActive={false} name="Valeur" type="monotone" dataKey="val" stroke="#2563EB" strokeWidth={3} dot={{r:3}} activeDot={{r:6}} /><Line isAnimationActive={false} name="Investi" type="monotone" dataKey="invested" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" dot={false} /></LineChart></ResponsiveContainer>) : <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-slate-700 rounded-lg">Ajoutez au moins 2 valorisations</div>}</div></div></div><div className="flex gap-4 mt-8"><button onClick={() => openModal('movementList')} className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 px-4 py-3 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 font-bold flex items-center justify-center gap-2 shadow-sm transition-all"><History className="w-5 h-5" /> Mouvements</button><button onClick={() => openModal('snapshot')} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 shadow-lg font-bold flex items-center justify-center gap-2 transition-all"><PlusCircle className="w-5 h-5" /> Nouvelle Valorisation</button></div><div className="mt-6 space-y-3"><h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Historique de valorisation</h3>{[...snapshots].reverse().map((s, i) => { const prev = snapshots[snapshots.length - 2 - i]; const diff = prev ? parseFloat(s.amount) - parseFloat(prev.amount) : 0; return (<div key={s.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 flex justify-between items-center hover:shadow-lg transition-all"><div><div className="font-bold text-gray-800 dark:text-white">{new Date(s.date).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'})}</div><div className="text-sm flex items-center mt-1"><span className="font-bold text-gray-700 dark:text-gray-300 mr-3"><BlurMoney amount={parseFloat(s.amount)} currency={symbol} privacyMode={privacyMode} /></span>{prev && <span className={`flex items-center text-xs font-semibold px-2 py-0.5 rounded ${diff >= 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{diff > 0 ? '+' : ''}<BlurMoney amount={diff} currency={symbol} privacyMode={privacyMode} /></span>}</div></div><div className="flex gap-1"><button onClick={() => openModal('snapshot', s)} className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"><Edit2 className="w-5 h-5" /></button><button onClick={() => deleteSnapshot(selectedBroker.id, selectedAccount.id, s.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"><Trash2 className="w-5 h-5" /></button></div></div>); })}</div></div>);
  };
  const Dashboard = () => {
    const [expandedCategory, setExpandedCategory] = useState(null);
    const allSnapshots = brokers.flatMap(b => b.accounts.map(a => ({ account: a, snapshots: a.snapshots || [] }))).flatMap(item => item.snapshots.map(s => ({ ...s, rate: item.account.exchangeRate || 1 }))); const allDates = [...new Set(allSnapshots.map(s => s.date))].sort();
    const evolution = allDates.map(date => {
        const totalAtDate = brokers.reduce((sum, broker) => {
            return sum + broker.accounts.reduce((accSum, acc) => {
                const relevantSnap = acc.snapshots?.filter(s => s.date <= date).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                const amount = relevantSnap ? parseFloat(relevantSnap.amount) : 0;
                const rate = parseFloat(acc.exchangeRate || 1);
                return accSum + (amount * rate);
            }, 0);
        }, 0);
        const investedAtDate = brokers.reduce((sum, broker) => {
            return sum + broker.accounts.reduce((accSum, acc) => {
                const investedTotal = getNetInvestedUntilDate(acc.movements || [], date);
                return accSum + (investedTotal * parseFloat(acc.exchangeRate || 1));
            }, 0);
        }, 0);
        return { 
            date: new Date(date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), 
            valeur: totalAtDate, 
            investi: investedAtDate > 0 ? investedAtDate : 0 
        };
    });
    const progress = Math.min((totalPatrimony / patrimonyGoal) * 100, 100);
    const accountIds = [...new Set(brokers.flatMap(b => b.accounts.map(a => a.id)))];
    const accountNames = {};
    const accountColors = {};
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#14B8A6', '#6B7280'];
    
    brokers.forEach(b => b.accounts.forEach((a, i) => {
        accountNames[a.id] = `${b.name} - ${a.name}`;
        accountColors[a.id] = colors[Object.keys(accountNames).length % colors.length];
    }));

    return (
        <div className="space-y-8 animate-fade-in w-full">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg relative overflow-hidden">
                <div className="flex justify-between items-center mb-4 relative z-10">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Objectif Patrimonial</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Progression vers votre cible</p>
                    </div>
                    <button onClick={() => openModal('goal')} className="p-2 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 transition-colors">
                        <Target className="w-5 h-5" />
                    </button>
                </div>
                <div className="relative z-10">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-3xl font-bold text-gray-900 dark:text-white"><BlurMoney amount={totalPatrimony} privacyMode={privacyMode} /></span>
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400"><BlurMoney amount={patrimonyGoal} privacyMode={privacyMode} /></span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden border border-gray-200 dark:border-slate-600">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="text-right text-xs font-bold text-blue-600 dark:text-blue-400 mt-1">{progress.toFixed(1)}% atteint</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg flex flex-col justify-between">
                    <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">Patrimoine Total</div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white"><BlurMoney amount={totalPatrimony} privacyMode={privacyMode} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg flex flex-col justify-between">
                    <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">Capital Investi</div>
                    <div className="text-3xl font-bold text-gray-700 dark:text-gray-200"><BlurMoney amount={totalInvestedGlobal} privacyMode={privacyMode} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg flex flex-col justify-between">
                    <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">Plus/Moins Value</div>
                    <div className={`text-3xl font-bold ${totalNetGainLoss >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {totalNetGainLoss >= 0 ? '+' : ''}<BlurMoney amount={totalNetGainLoss} privacyMode={privacyMode} />
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg flex flex-col justify-between">
                    <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">Performance Globale</div>
                    <div className="text-3xl font-bold"><PerformanceBadge current={totalPatrimony} invested={totalInvestedGlobal} tri={globalTRI} twr={globalTWR} /></div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg">
                    <h3 className="font-bold mb-6 flex items-center gap-2 text-lg text-gray-800 dark:text-white"><TrendingUp className="w-5 h-5 text-green-500" /> Évolution : Épargne vs Intérêts</h3>
                    <div className="h-72">
                        {evolution.length > 1 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={evolution}>
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.1} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#64748B" stopOpacity={0.1} /><stop offset="95%" stopColor="#64748B" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#f0f0f0'} />
                                    <XAxis dataKey="date" fontSize={12} stroke="#9CA3AF" />
                                    <YAxis domain={['dataMin', 'dataMax']} fontSize={12} stroke="#9CA3AF" tickFormatter={v => privacyMode ? '***' : (v / 1000).toFixed(0) + 'k'} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#fff' : '#000' }} formatter={(value) => privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="valeur" name="Valeur Totale" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                                    <Area isAnimationActive={false} type="monotone" dataKey="investi" name="Capital Investi" stroke="#64748B" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorInv)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-slate-700 rounded-xl">Ajoutez des valorisations pour voir le graphique</div>}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold flex items-center gap-2 text-lg text-gray-800 dark:text-white"><PieChartIcon className="w-5 h-5 text-blue-500" /> Répartition Actifs & Enveloppes</h3>
                        <div className="flex items-center gap-2">
                            <button onClick={() => openModal('allocation')} className="text-xs bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors"><Target className="w-3 h-3" /> Cible</button>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row gap-6 min-h-0 overflow-hidden">
                        <div className="flex-1 flex flex-col h-[400px] sm:h-auto">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Par Type d'Actifs</h4>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                                {globalCategoryDistribution.length > 0 ? globalCategoryDistribution.map((d, i) => {
                                    const targetPct = targetAllocation[d.type] || 0;
                                    const idealAmount = totalPatrimony * (targetPct / 100);
                                    const delta = idealAmount - d.value;
                                    const needsAction = Math.abs(delta) > 100;
                                    const isNegative = d.value < 0;
                                    return (
                                        <div key={i} className="group">
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center truncate max-w-[150px]"><div className="w-2 h-2 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: d.color }}></div>{d.label}</span>
                                                <div className="text-right flex-shrink-0">
                                                    <span className={`font-bold block ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                                        <BlurMoney amount={d.value} privacyMode={privacyMode} /> <span className="text-gray-400 font-normal">({d.percentage}%)</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative w-full h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className="absolute top-0 left-0 h-full transition-all duration-500" style={{ width: `${d.percentage}%`, backgroundColor: d.color, opacity: 0.8 }}></div>
                                                {targetPct > 0 && <div className="absolute top-0 w-0.5 h-full bg-black/50 dark:bg-white/50 z-10" style={{ left: `${targetPct}%` }}></div>}
                                            </div>
                                            {targetPct > 0 && (
                                                <div className="flex justify-between items-center mt-1 text-[10px]">
                                                    <span className="text-gray-400">Cible : {targetPct}%</span>
                                                    {needsAction && !isNegative && (
                                                        <span className={`font-bold ${delta > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400'} flex items-center gap-1`}>
                                                            {delta > 0 ? 'Acheter' : 'Vendre'} <BlurMoney amount={Math.abs(delta)} privacyMode={privacyMode} />
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }) : <div className="h-full flex items-center justify-center text-gray-400">Aucun actif</div>}
                            </div>
                        </div>
                        <div className="w-px bg-gray-100 dark:bg-slate-700 hidden sm:block"></div>
                        <div className="flex-1 flex flex-col h-[400px] sm:h-auto">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Par Enveloppe (Types)</h4>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                                {globalAccountTypeDistribution.length > 0 ? globalAccountTypeDistribution.map((d, i) => {
                                    const isNegative = d.value < 0;
                                    return (
                                        <div key={i} className="group">
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center truncate max-w-[150px]"><div className="w-2 h-2 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: d.color }}></div>{d.label}</span>
                                                <div className="text-right flex-shrink-0">
                                                    <span className={`font-bold block ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                                        <BlurMoney amount={d.value} privacyMode={privacyMode} /> <span className="text-gray-400 font-normal">({d.percentage}%)</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative w-full h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className="absolute top-0 left-0 h-full transition-all duration-500" style={{ width: `${d.percentage}%`, backgroundColor: d.color, opacity: 0.8 }}></div>
                                            </div>
                                        </div>
                                    );
                                }) : <div className="h-full flex items-center justify-center text-gray-400">Aucun compte</div>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg">
                <h3 className="font-bold mb-6 flex items-center gap-2 text-lg text-gray-800 dark:text-white"><BarChart3 className="w-5 h-5 text-indigo-500" /> Répartition des actifs par enveloppe</h3>
                <div className="h-80">
                    {crossDistributionData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={crossDistributionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#f0f0f0'} />
                                <XAxis dataKey="name" fontSize={12} stroke="#9CA3AF" />
                                <YAxis fontSize={12} stroke="#9CA3AF" tickFormatter={v => privacyMode ? '***' : (v / 1000).toFixed(0) + 'k'} />
                                <Tooltip
                                    cursor={{fill: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#fff' : '#000', padding: '12px' }}
                                    formatter={(value, name, props) => {
                                        if (name === "total" || privacyMode) return null;
                                        const accountName = accountNames[name] || name;
                                        const percentage = ((value / props.payload.total) * 100).toFixed(1);
                                        return [
                                            <span className="flex flex-col">
                                                <span className="font-bold">{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)}</span>
                                                <span className="text-[10px] opacity-70">{percentage}% de la classe d'actif</span>
                                            </span>,
                                            accountName
                                        ];
                                    }}
                                />
                                {accountIds.map((id) => (
                                    <Bar 
                                        key={id} 
                                        dataKey={id} 
                                        stackId="a" 
                                        fill={accountColors[id]} 
                                        radius={[0, 0, 0, 0]}
                                        isAnimationActive={false}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-slate-700 rounded-xl">Pas de données d'actifs</div>}
                </div>
            </div>
        </div>
    );
  };
  
  return (
    <div className={`min-h-screen font-sans pb-20 w-full transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-gray-900'}`}>
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30 shadow-md w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xl cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setView('dashboard')}>
            <div className="bg-blue-600 text-white p-1.5 rounded-lg"><Wallet className="w-6 h-6" /></div>
            <span className="hidden sm:inline">Suivi Investissements</span>
          </div>
          <nav className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl overflow-x-auto">
            {['dashboard', 'brokers', 'movements', 'simulation', 'history'].map(k => (
                <button 
                key={k} 
                onClick={() => { setView(k); setSelectedBroker(null); setSelectedAccount(null); }} 
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${view === k ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                >
                {k === 'dashboard' ? 'Dash' : k === 'brokers' ? 'Courtiers' : k === 'movements' ? 'Mouvements' : k === 'simulation' ? 'Simul' : 'Historique'}
                </button>
            ))}
            </nav>
          <div className="flex gap-2 items-center">
            {saving && <Save className="w-5 h-5 text-gray-400 animate-pulse" />}
            <button onClick={() => setPrivacyMode(!privacyMode)} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title={privacyMode ? "Afficher montants" : "Masquer montants"}>{privacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
            <button onClick={() => openModal('transfer')} className="p-2 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors" title="Transfert"><ArrowRightLeft className="w-5 h-5" /></button>
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 text-gray-500 dark:text-yellow-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
            <div className="h-8 w-px bg-gray-200 dark:bg-slate-700 mx-2"></div>
            
            {/* BOUTONS IMPORT / EXPORT */}
            <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json,.csv" />
            <button onClick={() => fileInputRef.current.click()} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg" title="Importer (JSON ou CSV)"><Upload className="w-5 h-5" /></button>
            <button onClick={handleExport} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg" title="Exporter Cloud (JSON)"><Download className="w-5 h-5" /></button>
            <button onClick={handleExportCSV} className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg ml-1" title="Export Excel (CSV)"><div className="font-bold text-xs border border-current rounded px-1">CSV</div></button>
            
            <button onClick={handleResetData} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg ml-2" title="Réinitialiser"><RotateCcw className="w-5 h-5" /></button>
            <button onClick={handleLogout} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg" title="Déconnexion"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">{dataLoading ? <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-gray-300 animate-spin" /></div> : <>{view === 'dashboard' && <Dashboard />}{view === 'brokers' && <BrokersView />}{view === 'accounts' && <AccountsView />}{view === 'snapshots' && <SnapshotsView />}{view === 'movements' && <MovementsGlobalView brokers={brokers} privacyMode={privacyMode} />}{view === 'simulation' && <SimulationView currentTotal={totalPatrimony} globalTRI={globalTRI} patrimonyGoal={patrimonyGoal} privacyMode={privacyMode} />}{view === 'history' && <HistoryView brokers={brokers} darkMode={darkMode} privacyMode={privacyMode} />}</>}</main>
      
      {/* MODALS */}
      <Modal isOpen={modals.broker} onClose={closeModal} title={editData ? "Modifier courtier" : "Nouveau courtier"}><BrokerForm onSubmit={handleSaveBroker} onCancel={closeModal} initialValue={editData ? editData.name : ''} /></Modal>
      <Modal isOpen={modals.account} onClose={closeModal} title={editData ? "Modifier compte" : "Nouveau compte"}><AccountForm brokerId={selectedBroker?.id} onSubmit={handleSaveAccount} onCancel={closeModal} initialData={editData} /></Modal>
      <Modal isOpen={modals.snapshot} onClose={closeModal} title={editData ? "Modifier valorisation" : "Nouvelle valorisation"}><SnapshotForm brokerId={selectedBroker?.id} accountId={selectedAccount?.id} onSubmit={handleSaveSnapshot} onCancel={closeModal} currencySymbol={selectedAccount?.currency ? CURRENCIES.find(c => c.code === selectedAccount.currency)?.symbol : '€'} initialData={editData} /></Modal>
      <Modal isOpen={modals.movement} onClose={() => {closeModal(); openModal('movementList')}} title={editData ? "Modifier mouvement" : "Nouveau mouvement"}><MovementForm onSubmit={handleSaveMovement} onCancel={() => {closeModal(); openModal('movementList')}} currencySymbol={selectedAccount?.currency ? CURRENCIES.find(c => c.code === selectedAccount.currency)?.symbol : '€'} initialData={editData} lastValuation={getAccountCurrentValueRaw(selectedAccount || {})} /></Modal>
      <Modal isOpen={modals.transfer} onClose={closeModal} title="Effectuer un transfert"><TransferForm brokers={brokers} onSubmit={handleSaveTransfer} onCancel={closeModal} /></Modal>
      <Modal isOpen={modals.movementList} onClose={closeModal} title="Historique des versements"><div className="space-y-4"><div className="flex justify-between items-center bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg border border-gray-200 dark:border-slate-600"><span className="font-medium text-gray-600 dark:text-gray-300">Total Investi :</span><span className="font-bold text-lg text-gray-900 dark:text-white"><BlurMoney amount={getAccountInvestedTotalRaw(selectedAccount || {})} currency={selectedAccount?.currency} privacyMode={privacyMode} /></span></div><button onClick={() => { closeModal(); openModal('movement'); }} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"><PlusCircle className="w-4 h-4" /> Ajouter un mouvement</button><div className="space-y-2 mt-4 max-h-64 overflow-y-auto">{selectedAccount?.movements && selectedAccount.movements.length > 0 ? selectedAccount.movements.map(m => (<div key={m.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg"><div className="flex items-center gap-3"><div className={`p-1.5 rounded-full ${m.type === 'deposit' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : m.type === 'interest' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>{m.type === 'deposit' ? <ArrowUpCircle className="w-4 h-4" /> : m.type === 'interest' ? <Percent className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}</div><div><div className="font-bold text-gray-800 dark:text-white">{new Date(m.date).toLocaleDateString()}</div><div className="text-xs text-gray-500 dark:text-gray-400">{m.type === 'deposit' ? 'Dépôt' : m.type === 'interest' ? 'Dividende' : 'Retrait'}</div></div></div><div className="flex items-center gap-3"><span className={`font-bold ${m.type === 'deposit' ? 'text-green-700 dark:text-green-400' : m.type === 'interest' ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>{m.type === 'withdrawal' ? '-' : '+'}<BlurMoney amount={parseFloat(m.amount)} privacyMode={privacyMode} /></span><div className="flex gap-1"><button onClick={() => { closeModal(); openModal('movement', m); }} className="text-gray-300 hover:text-blue-500 dark:hover:text-blue-400"><Edit2 className="w-4 h-4" /></button><button onClick={() => deleteMovement(m.id)} className="text-gray-300 hover:text-red-500 dark:hover:text-red-400"><Trash2 className="w-4 h-4" /></button></div></div></div>)) : <div className="text-center text-gray-400 py-4">Aucun mouvement enregistré</div>}</div></div></Modal>
      <Modal isOpen={modals.allocation} onClose={closeModal} title="Définir l'allocation cible"><TargetAllocationForm currentTargets={targetAllocation} onSubmit={(t) => { const newAlloc = t; saveUserData(undefined, undefined, newAlloc); closeModal(); showToast('Cibles mises à jour'); }} onCancel={closeModal} /></Modal>
      <Modal isOpen={modals.goal} onClose={closeModal} title="Objectif Patrimonial"><div className="space-y-4"><label className={labelClass}>Montant cible (€)</label><input type="number" defaultValue={patrimonyGoal} id="goalInput" className={`${inputClass} text-lg font-bold`} /><div className="flex justify-end gap-2 pt-4"><button onClick={closeModal} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button><button onClick={() => { const val = parseFloat(document.getElementById('goalInput').value); if(val > 0) { saveUserData(undefined, val, undefined); closeModal(); showToast('Objectif mis à jour'); } }} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">Valider</button></div></div></Modal>
      <Toast message={notification.message} type={notification.type} onClose={() => setNotification({ ...notification, message: '' })} />
    </div>
  );
};

// --- COMPOSANTS FORMULAIRES EXTERNALISÉS (POUR ALLEGER LE FICHIER) ---
const BrokerForm = ({ onSubmit, onCancel, initialValue = '' }) => { const [name, setName] = useState(initialValue); return (<div className="space-y-4"><div><label className={labelClass}>Nom</label><input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} /></div><div className="flex justify-end gap-2 pt-4"><button onClick={onCancel} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button><button onClick={() => name.trim() && onSubmit(name.trim())} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">Enregistrer</button></div></div>); };
const AccountForm = ({ brokerId, onSubmit, onCancel, initialData }) => { const [data, setData] = useState(initialData || { name: '', type: 'PEA', currency: 'EUR', exchangeRate: 1, notes: '' }); return (<div className="space-y-4"><div><label className={labelClass}>Nom</label><input autoFocus type="text" value={data.name} onChange={e => setData({...data, name: e.target.value})} className={inputClass} /></div><div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>Type</label><select value={data.type} onChange={e => setData({...data, type: e.target.value})} className={inputClass}>{ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div><div><label className={labelClass}>Devise</label><select value={data.currency} onChange={e => setData({...data, currency: e.target.value})} className={inputClass}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div></div>{data.currency !== 'EUR' && (<div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800"><label className="text-sm font-bold text-orange-900 dark:text-orange-300">Taux de change</label><div className="flex items-center gap-2"><span className="text-sm dark:text-gray-300">1 {data.currency} = </span><input type="number" step="0.0001" value={data.exchangeRate} onChange={e => setData({...data, exchangeRate: e.target.value})} className="w-24 border p-1 rounded bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white" /><span className="text-sm dark:text-gray-300">EUR</span></div></div>)}<div className="flex justify-end gap-2 pt-4"><button onClick={onCancel} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button><button onClick={() => data.name && onSubmit(brokerId, data)} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">Enregistrer</button></div></div>); };
const MovementForm = ({ onSubmit, onCancel, currencySymbol, initialData, lastValuation }) => {
    const [data, setData] = useState(initialData || {
        date: new Date().toISOString().split('T')[0],
        amount: '',
        type: 'deposit',
        preValuation: (initialData?.type === 'withdrawal' || !initialData) ? (initialData?.preValuation || lastValuation || '') : ''
    });

    const handleTypeChange = (type) => {
        setData(prev => ({
            ...prev,
            type,
            preValuation: type === 'withdrawal' ? (prev.preValuation || lastValuation || '') : prev.preValuation
        }));
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-slate-700 rounded-lg">
                <button onClick={() => handleTypeChange('deposit')} className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-md flex items-center justify-center gap-1 transition-all ${data.type === 'deposit' ? 'bg-white dark:bg-slate-600 text-green-700 dark:text-green-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><ArrowUpCircle className="w-4 h-4" /> Dépôt</button>
                <button onClick={() => handleTypeChange('interest')} className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-md flex items-center justify-center gap-1 transition-all ${data.type === 'interest' ? 'bg-white dark:bg-slate-600 text-yellow-600 dark:text-yellow-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><Percent className="w-4 h-4" /> Dividende</button>
                <button onClick={() => handleTypeChange('withdrawal')} className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-md flex items-center justify-center gap-1 transition-all ${data.type === 'withdrawal' ? 'bg-white dark:bg-slate-600 text-red-700 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><ArrowDownCircle className="w-4 h-4" /> Retrait</button>
            </div>
            {data.type === 'withdrawal' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 animate-fade-in">
                    <label className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-1 block">Valeur TOTALE du compte AVANT ce retrait</label>
                    <div className="flex items-center gap-2">
                        <input type="number" step="0.01" value={data.preValuation} onChange={e => setData({ ...data, preValuation: e.target.value })} className="w-full p-2 border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white" placeholder="Ex: 2000" />
                        <span className="text-sm font-bold text-gray-500">{currencySymbol}</span>
                    </div>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">Suggéré : Dernière valorisation connue. Indispensable pour la justesse du "Capital Investi".</p>
                </div>
            )}
            <div><label className={labelClass}>Date</label><input type="date" value={data.date} onChange={e => setData({ ...data, date: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Montant ({currencySymbol})</label><input autoFocus type="number" step="0.01" value={data.amount} onChange={e => setData({ ...data, amount: e.target.value })} className={`${inputClass} font-bold text-lg`} /></div>
            <div className="flex justify-end gap-2 pt-4">
                <button onClick={onCancel} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button>
                <button onClick={() => data.amount && onSubmit(data)} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">{initialData ? "Modifier" : "Valider"}</button>
            </div>
        </div>
    );
};
const TransferForm = ({ brokers, onSubmit, onCancel }) => {
    const [data, setData] = useState({ date: new Date().toISOString().split('T')[0], amount: '', sourceId: '', targetId: '', preValuation: '' });
    const allAccounts = brokers.flatMap(b => b.accounts.map(a => ({ ...a, brokerName: b.name, brokerId: b.id })));
    const sourceAccount = allAccounts.find(a => a.id == data.sourceId);
    const currencySymbol = sourceAccount ? (CURRENCIES.find(c => c.code === sourceAccount.currency)?.symbol || '€') : '€';

    const handleSourceChange = (id) => {
        const acc = allAccounts.find(a => a.id == id);
        let preVal = '';
        if (acc && acc.snapshots?.length) {
            preVal = acc.snapshots[acc.snapshots.length - 1].amount;
        }
        setData({ ...data, sourceId: id, preValuation: preVal });
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>De (Compte source)</label>
                    <select value={data.sourceId} onChange={e => handleSourceChange(e.target.value)} className={inputClass}>
                        <option value="">Sélectionner</option>
                        {allAccounts.map(a => <option key={a.id} value={a.id} disabled={a.id === data.targetId}>{a.brokerName} - {a.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Vers (Compte cible)</label>
                    <select value={data.targetId} onChange={e => setData({ ...data, targetId: e.target.value })} className={inputClass}>
                        <option value="">Sélectionner</option>
                        {allAccounts.map(a => <option key={a.id} value={a.id} disabled={a.id === data.sourceId}>{a.brokerName} - {a.name}</option>)}
                    </select>
                </div>
            </div>
            {data.sourceId && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 animate-fade-in">
                    <label className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-1 block">Valeur du compte SOURCE avant transfert</label>
                    <div className="flex items-center gap-2">
                        <input type="number" step="0.01" value={data.preValuation} onChange={e => setData({ ...data, preValuation: e.target.value })} className="w-full p-2 border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white" placeholder="Total du compte source" />
                        <span className="text-sm font-bold text-gray-500">{currencySymbol}</span>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Permet de neutraliser l'impact du transfert sur le calcul de performance TWR.</p>
                </div>
            )}
            <div><label className={labelClass}>Date</label><input type="date" value={data.date} onChange={e => setData({ ...data, date: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Montant du transfert</label><input type="number" step="0.01" value={data.amount} onChange={e => setData({ ...data, amount: e.target.value })} className={inputClass} /></div>
            <div className="flex justify-end gap-2 pt-4">
                <button onClick={onCancel} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button>
                <button onClick={() => data.amount && data.sourceId && data.targetId && onSubmit(data)} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">Valider</button>
            </div>
        </div>
    );
};
const SnapshotForm = ({ brokerId, accountId, onSubmit, onCancel, currencySymbol, initialData }) => { const [date, setDate] = useState(initialData ? initialData.date : new Date().toISOString().split('T')[0]); const [cats, setCats] = useState(INVESTMENT_CATEGORIES.map(c => { const existing = initialData?.categories?.find(k => k.type === c.value); return { type: c.value, amount: existing ? existing.amount : '' }; })); const total = cats.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0); return (<div className="space-y-4"><div><label className={labelClass}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} /></div><div className="border-t border-gray-200 dark:border-slate-700 pt-4"><h4 className="text-sm font-bold mb-3 text-gray-900 dark:text-gray-100">Répartition</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2">{INVESTMENT_CATEGORIES.map(cat => { const val = cats.find(c => c.type === cat.value)?.amount || ''; const Icon = cat.icon; return (<div key={cat.value} className="flex items-center p-2.5 border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700/50"><Icon className="w-5 h-5 mr-2" style={{color: cat.color}} /><span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">{cat.label}</span><input type="number" placeholder="0" step="0.01" value={val} onChange={e => setCats(cats.map(c => c.type === cat.value ? { ...c, amount: e.target.value } : c))} className="w-24 text-right p-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:border-blue-500" /></div>); })}</div></div><div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex justify-between items-center"><span className="font-bold text-blue-900 dark:text-blue-300">Total</span><span className="font-bold text-2xl text-blue-700 dark:text-blue-400">{total.toLocaleString('fr-FR')} {currencySymbol}</span></div><div className="flex justify-end gap-2 pt-2"><button onClick={onCancel} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button><button onClick={() => { const valid = cats.filter(c => c.amount !== '' && c.amount !== null && parseFloat(c.amount) !== 0).map(c => ({...c, amount: parseFloat(c.amount).toFixed(2)})); if(valid.length) onSubmit(brokerId, accountId, { date, categories: valid, id: initialData?.id }); else alert("Saisissez au moins un montant"); }} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">{initialData ? "Modifier" : "Valider"}</button></div></div>); };
const TargetAllocationForm = ({ currentTargets, onSubmit, onCancel }) => { const [targets, setTargets] = useState(INVESTMENT_CATEGORIES.map(c => ({ ...c, percent: currentTargets[c.value] || 0 }))); const totalPercent = targets.reduce((s, c) => s + parseFloat(c.percent || 0), 0); return (<div className="space-y-4"><div className="flex justify-between items-center bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg border border-gray-200 dark:border-slate-600"><span className="font-medium text-gray-700 dark:text-gray-300">Total alloué :</span><span className={`font-bold text-lg ${totalPercent === 100 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{totalPercent}%</span></div><div className="max-h-80 overflow-y-auto space-y-2 pr-2">{targets.map(cat => (<div key={cat.value} className="flex items-center justify-between p-2 border border-gray-200 dark:border-slate-600 rounded-lg"><span className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"><div className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: cat.color}}></div>{cat.label}</span><div className="flex items-center gap-2"><input type="number" min="0" max="100" value={cat.percent} onChange={e => setTargets(targets.map(t => t.value === cat.value ? { ...t, percent: parseFloat(e.target.value) || 0 } : t))} className="w-16 text-right p-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /><span className="text-gray-500">%</span></div></div>))}</div><div className="flex justify-end gap-2 pt-4"><button onClick={onCancel} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button><button onClick={() => { const mapping = {}; targets.forEach(t => { if(t.percent > 0) mapping[t.value] = t.percent; }); onSubmit(mapping); }} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">Enregistrer</button></div></div>); };
const PerformanceBadge = ({ current, invested, tri, twr }) => { 
    if (!invested || parseFloat(invested) === 0) return null; 
    const perf = ((parseFloat(current) - parseFloat(invested)) / parseFloat(invested)) * 100; 
    const isPositive = perf >= 0; 
    const isTwrPositive = twr >= 0;
    return (
        <div className="flex flex-wrap gap-2">
            <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${isPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`} title="Performance brute (Valeur finale vs Capital net versé)">
                {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {perf > 0 ? '+' : ''}{perf.toFixed(1)}%
            </div>
            {twr !== null && (
                <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${isTwrPositive ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`} title="Time-Weighted Return (Performance réelle du portefeuille, neutralise l'impact des flux)">
                    <Activity className="w-3 h-3 mr-1" />TWR: {twr > 0 ? '+' : ''}{twr.toFixed(2)}%
                </div>
            )}
            {tri !== null && (
                <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400`} title="Taux de Rentabilité Interne (Performance annualisée, prend en compte le timing des flux)">
                    <GitCompare className="w-3 h-3 mr-1" />TRI: {tri > 0 ? '+' : ''}{tri.toFixed(1)}%/an
                </div>
            )}
        </div>
    ); 
};

export default InvestmentTrackerApp;