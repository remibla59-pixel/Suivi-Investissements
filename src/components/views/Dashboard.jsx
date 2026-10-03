// --- VUE : TABLEAU DE BORD ---
// Objectif patrimonial, indicateurs globaux, évolution et répartitions (extraite du fichier principal, axe 2 de l'audit).
import { useMemo, useState, useEffect } from "react";
import { Target, TrendingUp, TrendingDown, PieChart as PieChartIcon, BarChart3, Gauge, ShieldCheck, Activity, AlertTriangle, Loader2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ReferenceLine, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getNetInvestedUntilDate, processMonthlyStats, calculateSharpeRatio, formatCompactAxis, isAccountClosedAt, processAllocationHistory } from "../../utils/calculs.js";
import { INVESTMENT_CATEGORIES, INVESTMENT_SUBCATEGORIES } from "../../utils/constantes.js";
import { BlurMoney, PerformanceBadge, ChartTooltip, ChartLegend, axisTickProps, gridStroke, subcategoryShades } from "../ui.jsx";

// Sélecteur de niveau : voir la répartition par classe d'actifs ou par sous-catégorie.
// C'est un choix d'affichage uniquement — les montants enregistrés ne changent pas.
const LEVELS = [
    { value: 'class', label: 'Classes' },
    { value: 'sub', label: 'Sous-catégories' }
];
const LevelSelector = ({ level, onChange }) => (
    <div className="inline-flex border border-[#D8D2C4] dark:border-slate-600 divide-x divide-[#D8D2C4] dark:divide-slate-600">
        {LEVELS.map(l => (
            <button
                key={l.value}
                onClick={() => onChange(l.value)}
                title={l.value === 'class' ? "Vue par classe d'actifs" : 'Vue par sous-catégorie (ETF, Small Caps, fonds datés...)'}
                className={`px-2.5 py-1.5 kicker transition-colors ${level === l.value ? 'bg-[#1B2A41] text-[#F6F4EE] dark:bg-slate-600 dark:text-white' : 'hover:bg-[#EDEAE0] dark:hover:bg-slate-700'}`}
            >
                {l.label}
            </button>
        ))}
    </div>
);
import { BENCHMARK_OPTIONS, getBenchmarkApiKey, fetchBenchmarkMonthly } from "../../utils/marketData.js";

export const Dashboard = ({ brokers, privacyMode, darkMode, totalPatrimony, patrimonyGoal, totalInvestedGlobal, totalNetGainLoss, globalTRI, twr, globalCategoryDistribution, globalAccountTypeDistribution, crossDistributionData, targetAllocation, openModal, initialLevel = 'class' }) => {
    const allSnapshots = brokers.flatMap(b => b.accounts.map(a => ({ account: a, snapshots: a.snapshots || [] }))).flatMap(item => item.snapshots.map(s => ({ ...s, rate: item.account.exchangeRate || 1 }))); const allDates = [...new Set(allSnapshots.map(s => s.date))].sort();
    const evolution = allDates.map(date => {
        const totalAtDate = brokers.reduce((sum, broker) => {
            return sum + broker.accounts.reduce((accSum, acc) => {
                if (isAccountClosedAt(acc, date)) return accSum;
                const relevantSnap = acc.snapshots?.filter(s => s.date <= date).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                const amount = relevantSnap ? parseFloat(relevantSnap.amount) : 0;
                const rate = parseFloat(acc.exchangeRate || 1);
                return accSum + (amount * rate);
            }, 0);
        }, 0);
        const investedAtDate = brokers.reduce((sum, broker) => {
            return sum + broker.accounts.reduce((accSum, acc) => {
                if (isAccountClosedAt(acc, date)) return accSum;
                const investedTotal = getNetInvestedUntilDate(acc.movements || [], date);
                return accSum + (investedTotal * parseFloat(acc.exchangeRate || 1));
            }, 0);
        }, 0);
        return { 
            date: new Date(date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), 
            monthKey: date.slice(0, 7), 
            valeur: totalAtDate, 
            investi: investedAtDate > 0 ? investedAtDate : 0 
        };
    });
    const progress = Math.min((totalPatrimony / patrimonyGoal) * 100, 100);
    const accountIds = [...new Set(brokers.flatMap(b => b.accounts.map(a => a.id)))];
    const accountNames = {};
    const accountColors = {};
    // Palette des enveloppes (comptes) : teintes sourdes, sans doublon.
    const colors = ['#1F4E79', '#14603B', '#9A6B2F', '#6B4E8F', '#A4493C', '#8C2F39', '#2F6F6B', '#6E7685'];
    
    brokers.forEach(b => b.accounts.forEach((a) => {
        accountNames[a.id] = `${b.name} - ${a.name}`;
        accountColors[a.id] = colors[Object.keys(accountNames).length % colors.length];
    }));

    // --- COMPARAISON BENCHMARK ---
    const benchmarkApiKey = getBenchmarkApiKey();
    const [benchmarkSymbol, setBenchmarkSymbol] = useState(() => { try { const stored = localStorage.getItem('benchmark_symbol'); return BENCHMARK_OPTIONS.some(o => o.symbol === stored) ? stored : 'SPY'; } catch { return 'SPY'; } });
    const [benchmarkData, setBenchmarkData] = useState(null);
    const [benchmarkLoading, setBenchmarkLoading] = useState(() => Boolean(getBenchmarkApiKey()));
    const [benchmarkError, setBenchmarkError] = useState(null);
    const [benchmarkRetry, setBenchmarkRetry] = useState(0);
    const [benchmarkYear, setBenchmarkYear] = useState('all');

    useEffect(() => {
        let cancelled = false;
        try { localStorage.setItem('benchmark_symbol', benchmarkSymbol); } catch { /* ignore */ }
        fetchBenchmarkMonthly(benchmarkSymbol, benchmarkApiKey)
            .then(values => { if (!cancelled) { setBenchmarkData(values); setBenchmarkError(null); setBenchmarkLoading(false); } })
            .catch(err => { if (!cancelled) { setBenchmarkData(null); setBenchmarkError((err && err.message) || 'Erreur de chargement'); setBenchmarkLoading(false); } });
        return () => { cancelled = true; };
    }, [benchmarkSymbol, benchmarkApiKey, benchmarkRetry]);

    const benchmarkLabel = BENCHMARK_OPTIONS.find(o => o.symbol === benchmarkSymbol)?.label || benchmarkSymbol;
    const benchmarkShort = benchmarkLabel.replace(/\s*\([^)]*\)\s*$/, '');

    // Série comparée : performance du portefeuille (TWR, nette des flux) vs indice,
    // ramenés à 100 au début de la fenêtre affichée — toute la période, ou une année
    // au choix. Quand la clôture du mois précédant le premier point est connue
    // (décembre de l'année d'avant pour une vue annuelle), la base 100 est placée à
    // la fin de ce mois : les deux courbes mesurent alors la performance réelle de la
    // fenêtre, y compris son premier mois.
    const benchmarkChart = useMemo(() => {
        if (!benchmarkData || !benchmarkData.length) return null;
        const stats = processMonthlyStats(brokers);
        if (stats.length < 2) return null;
        const benchByMonth = new Map(benchmarkData.map(p => [p.date.slice(0, 7), p.close]));
        const statsByMonth = new Map(stats.map(s => [s.month, s]));
        const allMonths = [...statsByMonth.keys()].filter(m => benchByMonth.has(m)).sort();
        if (allMonths.length < 2) return null;

        // Années proposées : celles qui ont assez de mois pour tracer une courbe
        // (l'année en cours est toujours proposée).
        const byYear = new Map();
        allMonths.forEach(m => byYear.set(m.slice(0, 4), (byYear.get(m.slice(0, 4)) || 0) + 1));
        const currentYear = String(new Date().getFullYear());
        const years = [...byYear.keys()].filter(y => byYear.get(y) >= 2 || y === currentYear);

        const activeYear = benchmarkYear !== 'all' && years.includes(benchmarkYear) ? benchmarkYear : 'all';
        const months = activeYear === 'all' ? allMonths : allMonths.filter(m => m.startsWith(activeYear));
        if (months.length < 2) return { years, points: null, activeYear };

        const firstMonth = months[0];
        const isJanStart = firstMonth.slice(5) === '01';
        // Mois qui porte la base 100 : pour une vue annuelle démarrant en janvier,
        // c'est la clôture de décembre de l'année précédente (début d'année) ; sinon,
        // le mois précédant le premier point commun quand sa clôture est connue ; en
        // dernier recours, le premier point commun lui-même.
        const prevMonth = isJanStart
            ? `${parseInt(firstMonth.slice(0, 4), 10) - 1}-12`
            : `${firstMonth.slice(0, 4)}-${String(parseInt(firstMonth.slice(5), 10) - 1).padStart(2, '0')}`;
        const benchHasPrev = benchByMonth.has(prevMonth);
        const baseMonth = benchHasPrev ? prevMonth : firstMonth;
        const baseBench = benchByMonth.get(baseMonth);

        const shortMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        const fmtShort = m => `${shortMonths[parseInt(m.slice(5), 10) - 1]} ${String(parseInt(m.slice(0, 4), 10) % 100).padStart(2, '0')}`;
        const baseLabel = fmtShort(baseMonth);

        // Vue annuelle démarrant en janvier : on affiche un point « base » à 100 à la
        // fin de décembre de l'année précédente, pour que la courbe parte exactement
        // du début d'année (base 100).
        const prependBase = activeYear !== 'all' && isJanStart && benchHasPrev;
        const points = prependBase
            ? [{ month: prevMonth, label: fmtShort(prevMonth), portefeuille: 100, benchmark: 100, base: true }]
            : [];

        let cum = 1;
        months.forEach((month, idx) => {
            const stat = statsByMonth.get(month);
            if (!stat) return;
            const r = 1 + parseFloat(stat.yield) / 100;
            if (!isFinite(r) || r <= 0) return;
            // Si la base est la fin du mois précédent, le 1er mois de la fenêtre est
            // mesuré ; sinon les deux courbes partent exactement de 100 à ce point.
            if (idx > 0 || baseMonth !== firstMonth) cum *= r;
            points.push({
                month,
                label: stat.displayDate,
                portefeuille: cum * 100,
                benchmark: (benchByMonth.get(month) / baseBench) * 100,
            });
        });
        if (points.length < 2) return { years, points: null, activeYear };

        const last = points[points.length - 1];
        const windowDesc = activeYear === 'all'
            ? (baseMonth === firstMonth
                ? `Période complète — base 100 au premier mois commun (${points[0].label}).`
                : `Période complète — base 100 fin ${baseLabel}, juste avant le premier mois commun (${points[0].label}).`)
            : (prependBase
                ? `Année ${activeYear} — base 100 au début de l'année (fin ${baseLabel}).`
                : (baseMonth === firstMonth
                    ? `Année ${activeYear} — base 100 au premier mois disponible (${points[0].label}).`
                    : `Année ${activeYear} — base 100 fin ${baseLabel}.`));
        return {
            points,
            years,
            activeYear,
            windowDesc,
            outperformance: last.portefeuille - last.benchmark,
            portfolioPct: last.portefeuille - 100,
            benchmarkPct: last.benchmark - 100,
        };
    }, [benchmarkData, brokers, benchmarkYear]);

    // --- ALERTES DE RÉÉQUILIBRAGE (écart > 5 points de % vs allocation cible) ---
    const rebalanceAlerts = useMemo(() => {
        const THRESHOLD_PTS = 5;
        return globalCategoryDistribution
            .map(d => {
                const targetPct = targetAllocation[d.type] || 0;
                if (targetPct <= 0) return null;
                const drift = parseFloat(d.percentage) - targetPct;
                return { ...d, targetPct, drift };
            })
            .filter(a => a !== null && Math.abs(a.drift) >= THRESHOLD_PTS)
            .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
    }, [globalCategoryDistribution, targetAllocation]);

    // --- INDICATEURS DE RISQUE (drawdown max, volatilité annualisée, Sharpe) ---
    const riskStats = useMemo(() => {
        const stats = processMonthlyStats(brokers);
        if (stats.length < 2) return null;
        let peak = -Infinity;
        let maxDrawdown = 0;
        stats.forEach(s => {
            const v = s.value;
            if (v > peak) peak = v;
            if (peak > 0) {
                const dd = (peak - v) / peak;
                if (dd > maxDrawdown) maxDrawdown = dd;
            }
        });
        const returns = stats.map(s => s.yield / 100);
        const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance) * Math.sqrt(12);
        return { maxDrawdown: maxDrawdown * 100, volatility: volatility * 100, sharpe: calculateSharpeRatio(returns) };
    }, [brokers]);

    // --- NIVEAU D'AFFICHAGE (classes d'actifs ou sous-catégories) ---
    // Purement visuel : la saisie et les agrégats restent au niveau des classes.
    const [level, setLevel] = useState(initialLevel === 'sub' ? 'sub' : 'class');
    // Lignes affichées dans « Par Type d'Actifs » : une par classe, ou une par
    // sous-catégorie (plus une ligne « non précisé » quand un montant de classe
    // n'a pas été ventilé dans ses sous-catégories).
    const levelRows = useMemo(() => {
        if (level === 'class') return globalCategoryDistribution;
        const absTotal = globalCategoryDistribution.reduce((s, d) => s + Math.abs(d.value), 0) || 1;
        const rows = [];
        globalCategoryDistribution.forEach(d => {
            const subs = d.subs || [];
            if (!subs.length) {
                rows.push({ ...d, key: d.type, targetPct: 0 });
                return;
            }
            const subsTotal = subs.reduce((s, x) => s + x.value, 0);
            const reste = d.value - subsTotal;
            const items = [...subs];
            if (Math.abs(reste) > 0.005) items.push({ sub: '__sans', label: 'non précisé', value: reste });
            items
                .map(x => ({ ...x, color: subcategoryShades(d.color, subs.findIndex(s => s.sub === x.sub) === -1 ? subs.length : subs.findIndex(s => s.sub === x.sub)) }))
                .sort((a, b) => b.value - a.value)
                .forEach(x => {
                    rows.push({
                        key: `${d.type}|${x.sub}`,
                        label: `${x.label} · ${d.label}`,
                        value: x.value,
                        color: x.color,
                        percentage: ((Math.abs(x.value) / absTotal) * 100).toFixed(1),
                        type: `${d.type}|${x.sub}`,
                        subs: [],
                        targetPct: 0
                    });
                });
        });
        return rows.sort((a, b) => b.value - a.value);
    }, [globalCategoryDistribution, level]);

    // --- ALLOCATION DANS LE TEMPS ---
    // Parts mensuelles par classe d'actifs (ou par sous-catégorie selon le niveau),
    // calculées à chaque fin de mois d'après les valorisations (les comptes clôturés
    // sortent de la répartition).
    const allocationHistory = useMemo(() => processAllocationHistory(brokers), [brokers]);
    const allocationChart = useMemo(() => {
        if (allocationHistory.length < 2) return null;

        // Séries affichées : classes d'actifs, ou sous-catégories (clé « type|sub »).
        let series;
        if (level === 'class') {
            const presentTypes = new Set();
            allocationHistory.forEach(p => Object.entries(p.values).forEach(([t, v]) => { if (v > 0) presentTypes.add(t); }));
            series = INVESTMENT_CATEGORIES.filter(c => presentTypes.has(c.value)).map(c => ({ dataKey: c.value, label: c.label, color: c.color }));
        } else {
            const present = new Set();
            allocationHistory.forEach(p => Object.entries(p.subValues || {}).forEach(([k, v]) => { if (v > 0) present.add(k); }));
            const seenByType = {};
            series = [...present].sort().map(key => {
                const [type, sub] = key.split('|');
                const base = INVESTMENT_CATEGORIES.find(c => c.value === type);
                const subDef = (INVESTMENT_SUBCATEGORIES[type] || []).find(s => s.value === sub);
                const idx = seenByType[type] || 0;
                seenByType[type] = idx + 1;
                return {
                    dataKey: key.replace('|', '__'),
                    label: sub === '__sans' ? `${base?.label || type} · non précisé` : (subDef?.label || sub),
                    color: subcategoryShades(base?.color || '#6E7685', idx)
                };
            });
        }
        if (!series.length) return null;

        const valueOf = (p, s) => (level === 'class' ? p.values[s.dataKey] : (p.subValues || {})[s.dataKey.replace('__', '|')]);
        const points = allocationHistory.map(p => {
            const posTotal = series.reduce((sum, s) => sum + Math.max(0, valueOf(p, s) || 0), 0);
            const row = { month: p.month, label: p.displayDate };
            series.forEach(s => { row[s.dataKey] = posTotal > 0 ? (Math.max(0, valueOf(p, s) || 0) / posTotal) * 100 : 0; });
            return row;
        });
        return { cats: series, points };
    }, [allocationHistory, level]);

    // Données du donut (parts positives), au niveau choisi
    const donutData = useMemo(() => levelRows.filter(d => d.value > 0 && !!d.color), [levelRows]);

    // Étiquettes à l'intérieur de la couronne : nom + % pour les parts lisibles
    const renderDonutLabel = (props) => {
        const { cx, cy, midAngle, innerRadius, outerRadius, percent, payload } = props;
        if (!payload || (percent || 0) * 100 < 5) return null;
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return (
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={700} fill="#FDFCF9">
                {payload.label} · {(percent * 100).toFixed(0)}%
            </text>
        );
    };

    return (
        <div className="space-y-8 animate-fade-in w-full">
            <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none relative overflow-hidden">
                <div className="flex justify-between items-center mb-4 relative z-10">
                    <div>
                        <h2 className="text-lg font-bold text-[#16233B] dark:text-white">Objectif Patrimonial</h2>
                        <p className="text-[#6E7685] dark:text-slate-400 text-sm">Progression vers votre cible</p>
                    </div>
                    <button onClick={() => openModal('goal')} className="p-2 bg-[#F3F1EA] dark:bg-slate-700 rounded-lg hover:bg-[#EDEAE0] dark:hover:bg-slate-600 border border-[#E1DCD0] dark:border-slate-600 text-[#3C4A61] dark:text-slate-300 transition-colors">
                        <Target className="w-5 h-5" />
                    </button>
                </div>
                <div className="relative z-10">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-3xl font-bold text-[#16233B] dark:text-white"><BlurMoney amount={totalPatrimony} privacyMode={privacyMode} /></span>
                        <span className="text-sm font-semibold text-[#6E7685] dark:text-slate-400"><BlurMoney amount={patrimonyGoal} privacyMode={privacyMode} /></span>
                    </div>
                    <div className="w-full bg-[#EDEAE0] dark:bg-slate-700 rounded-full h-4 overflow-hidden border border-[#E1DCD0] dark:border-slate-600">
                        <div className="h-full bg-gradient-to-r from-[#1B2A41] to-[#14603B] transition-all duration-1000 ease-out" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="text-right text-xs font-bold text-[#14603B] dark:text-emerald-400 mt-1">{progress.toFixed(1)}% atteint</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none flex flex-col justify-between">
                    <div className="text-[#6E7685] dark:text-slate-400 font-medium mb-1">Patrimoine Total</div>
                    <div className="text-3xl font-bold text-[#16233B] dark:text-white"><BlurMoney amount={totalPatrimony} privacyMode={privacyMode} /></div>
                </div>
                <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none flex flex-col justify-between">
                    <div className="text-[#6E7685] dark:text-slate-400 font-medium mb-1">Capital Investi</div>
                    <div className="text-3xl font-bold text-[#2A3B55] dark:text-slate-200"><BlurMoney amount={totalInvestedGlobal} privacyMode={privacyMode} /></div>
                </div>
                <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none flex flex-col justify-between">
                    <div className="text-[#6E7685] dark:text-slate-400 font-medium mb-1">Plus/Moins Value</div>
                    <div className={`text-3xl font-bold ${totalNetGainLoss >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {totalNetGainLoss >= 0 ? '+' : ''}<BlurMoney amount={totalNetGainLoss} privacyMode={privacyMode} />
                    </div>
                </div>
                <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none flex flex-col justify-between">
                    <div className="text-[#6E7685] dark:text-slate-400 font-medium mb-1">Performance Globale</div>
                    <div className="text-3xl font-bold"><PerformanceBadge current={totalPatrimony} invested={totalInvestedGlobal} tri={globalTRI} twr={twr} /></div>
                </div>
            </div>

            {rebalanceAlerts.length > 0 && (
            <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-amber-200 dark:border-amber-800/60 shadow-none">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-[#16233B] dark:text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Alertes de rééquilibrage</h3>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{rebalanceAlerts.length} alerte{rebalanceAlerts.length > 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rebalanceAlerts.map(a => {
                        const idealAmount = totalPatrimony * (a.targetPct / 100);
                        const delta = idealAmount - a.value;
                        return (
                            <div key={a.type} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E4E0D6] dark:border-slate-700 bg-[#F3F1EA] dark:bg-slate-700/50">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }}></div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm text-[#16233B] dark:text-white truncate">{a.label}</div>
                                        <div className="text-xs text-[#6E7685] dark:text-slate-400">Actuel {a.percentage}% · Cible {a.targetPct}%</div>
                                    </div>
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap ${delta > 0 ? 'bg-[#DCE7DE] text-[#14603B] dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {delta > 0 ? 'Acheter' : 'Vendre'} <BlurMoney amount={Math.abs(delta)} privacyMode={privacyMode} />
                                </span>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-[#8B93A1] dark:text-slate-500 mt-3">Seuil de tolérance : ±5 points de pourcentage par rapport à l'allocation cible.</p>
            </div>
            )}
            {riskStats && (
            <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none">
                <h3 className="font-bold mb-5 text-[#16233B] dark:text-white flex items-center gap-2"><Activity className="w-5 h-5 text-rose-500" /> Indicateurs de risque</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#F3F1EA] dark:bg-slate-700/50 rounded-xl p-4 border border-[#E4E0D6] dark:border-slate-700">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6E7685] dark:text-slate-400 uppercase tracking-wide mb-1"><TrendingDown className="w-4 h-4" /> Drawdown max</div>
                        <div className={`text-2xl font-bold ${riskStats.maxDrawdown <= -15 ? 'text-red-600 dark:text-red-400' : riskStats.maxDrawdown <= -7 ? 'text-orange-500 dark:text-orange-400' : 'text-[#16233B] dark:text-white'}`}>{riskStats.maxDrawdown.toFixed(1)}%</div>
                        <div className="text-xs text-[#6E7685] dark:text-slate-400 mt-1">Baisse maximale depuis un sommet</div>
                    </div>
                    <div className="bg-[#F3F1EA] dark:bg-slate-700/50 rounded-xl p-4 border border-[#E4E0D6] dark:border-slate-700">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6E7685] dark:text-slate-400 uppercase tracking-wide mb-1"><Gauge className="w-4 h-4" /> Volatilité annualisée</div>
                        <div className="text-2xl font-bold text-[#16233B] dark:text-white">{riskStats.volatility.toFixed(1)}%</div>
                        <div className="text-xs text-[#6E7685] dark:text-slate-400 mt-1">Écart-type des rendements mensuels</div>
                    </div>
                    <div className="bg-[#F3F1EA] dark:bg-slate-700/50 rounded-xl p-4 border border-[#E4E0D6] dark:border-slate-700">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6E7685] dark:text-slate-400 uppercase tracking-wide mb-1"><ShieldCheck className="w-4 h-4" /> Ratio de Sharpe</div>
                        <div className={`text-2xl font-bold ${riskStats.sharpe >= 1 ? 'text-green-600 dark:text-green-400' : riskStats.sharpe >= 0.5 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400'}`}>{riskStats.sharpe !== null ? riskStats.sharpe.toFixed(2) : '—'}</div>
                        <div className="text-xs text-[#6E7685] dark:text-slate-400 mt-1">Rendement ajusté du risque</div>
                    </div>
                </div>
            </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                        <h3 className="font-bold flex items-center gap-2 text-lg text-[#16233B] dark:text-white"><TrendingUp className="w-5 h-5 text-green-500" /> Évolution : Épargne vs Intérêts</h3>
                        <ChartLegend items={[{ name: 'Valeur Totale', color: '#14603B' }, { name: 'Capital Investi', color: '#6E7685' }]} />
                    </div>
                    <div className="h-72">
                        {evolution.length > 1 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={evolution}>
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14603B" stopOpacity={0.22} /><stop offset="100%" stopColor="#14603B" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6E7685" stopOpacity={0.12} /><stop offset="100%" stopColor="#6E7685" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid {...gridStroke(darkMode)} />
                                    <XAxis dataKey="date" tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickMargin={6} minTickGap={24} />
                                    <YAxis width={56} domain={['dataMin', 'dataMax']} tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickFormatter={v => privacyMode ? '***' : formatCompactAxis(v)} />
                                    <Tooltip content={<ChartTooltip darkMode={darkMode} formatter={(value) => privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)} />} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="valeur" name="Valeur Totale" stroke="#14603B" strokeWidth={2.25} fillOpacity={1} fill="url(#colorVal)" activeDot={{ r: 4 }} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="investi" name="Capital Investi" stroke="#6E7685" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorInv)" activeDot={{ r: 4 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : <div className="h-full flex items-center justify-center text-[#8B93A1] bg-[#F3F1EA] dark:bg-slate-700 rounded-xl">Ajoutez des valorisations pour voir le graphique</div>}
                    </div>
                </div>

                <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold flex items-center gap-2 text-lg text-[#16233B] dark:text-white"><PieChartIcon className="w-5 h-5 text-[#14603B]" /> Répartition Actifs & Enveloppes</h3>
                        <div className="flex items-center gap-2">
                            <button onClick={() => openModal('allocation')} className="text-xs bg-[#EDEAE0] dark:bg-slate-700 hover:bg-[#E4E0D6] dark:hover:bg-slate-600 text-[#2A3B55] dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors"><Target className="w-3 h-3" /> Cible</button>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row gap-6 min-h-0 overflow-hidden">
                        <div className="flex-1 flex flex-col h-[400px] sm:h-auto">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-1">
                                <h4 className="kicker">Par Type d'Actifs</h4>
                                <LevelSelector level={level} onChange={setLevel} />
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                                {levelRows.length > 0 ? levelRows.map((d, i) => {
                                    const targetPct = d.targetPct !== undefined ? d.targetPct : (targetAllocation[d.type] || 0);
                                    const idealAmount = totalPatrimony * (targetPct / 100);
                                    const delta = idealAmount - d.value;
                                    const needsAction = Math.abs(delta) > 100;
                                    const isNegative = d.value < 0;
                                    return (
                                        <div key={i} className="group">
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className="font-medium text-[#2A3B55] dark:text-slate-300 flex items-center truncate max-w-[150px]"><div className="w-2 h-2 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: d.color }}></div>{d.label}</span>
                                                <div className="text-right flex-shrink-0">
                                                    <span className={`font-bold block ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-[#16233B] dark:text-white'}`}>
                                                        <BlurMoney amount={d.value} privacyMode={privacyMode} /> <span className="text-[#8B93A1] font-normal">({d.percentage}%)</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative w-full h-2 bg-[#EDEAE0] dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className="absolute top-0 left-0 h-full transition-all duration-500" style={{ width: `${d.percentage}%`, backgroundColor: d.color, opacity: 0.8 }}></div>
                                                {targetPct > 0 && <div className="absolute top-0 w-0.5 h-full bg-black/50 dark:bg-[#FDFCF9]/50 z-10" style={{ left: `${targetPct}%` }}></div>}
                                            </div>
                                            {targetPct > 0 && (
                                                <div className="flex justify-between items-center mt-1 text-[10px]">
                                                    <span className="text-[#8B93A1]">Cible : {targetPct}%</span>
                                                    {needsAction && !isNegative && (
                                                        <span className={`font-bold ${delta > 0 ? 'text-[#14603B] dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} flex items-center gap-1`}>
                                                            {delta > 0 ? 'Acheter' : 'Vendre'} <BlurMoney amount={Math.abs(delta)} privacyMode={privacyMode} />
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {d.subs && d.subs.length > 0 && (
                                                <div className="mt-1.5 pl-4 space-y-0.5 border-l-2 border-[#E4E0D6] dark:border-slate-700">
                                                    {d.subs.map(s => (
                                                        <div key={s.sub} className="flex justify-between text-[11px] text-[#6E7685] dark:text-slate-400 gap-2">
                                                            <span className="truncate">{s.label}</span>
                                                            <span className="whitespace-nowrap"><BlurMoney amount={s.value} privacyMode={privacyMode} />{d.value !== 0 && <span className="ml-1 text-[#8B93A1]">({Math.abs((s.value / d.value) * 100).toFixed(0)} %)</span>}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }) : <div className="h-full flex items-center justify-center text-[#8B93A1]">Aucun actif</div>}
                            </div>
                        </div>
                        <div className="w-px bg-[#EDEAE0] dark:bg-slate-700 hidden sm:block"></div>
                        <div className="flex-1 flex flex-col h-[400px] sm:h-auto">
                            <h4 className="kicker mb-4 px-1">Par Enveloppe (Types)</h4>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                                {globalAccountTypeDistribution.length > 0 ? globalAccountTypeDistribution.map((d, i) => {
                                    const isNegative = d.value < 0;
                                    return (
                                        <div key={i} className="group">
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className="font-medium text-[#2A3B55] dark:text-slate-300 flex items-center truncate max-w-[150px]"><div className="w-2 h-2 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: d.color }}></div>{d.label}</span>
                                                <div className="text-right flex-shrink-0">
                                                    <span className={`font-bold block ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-[#16233B] dark:text-white'}`}>
                                                        <BlurMoney amount={d.value} privacyMode={privacyMode} /> <span className="text-[#8B93A1] font-normal">({d.percentage}%)</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative w-full h-2 bg-[#EDEAE0] dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className="absolute top-0 left-0 h-full transition-all duration-500" style={{ width: `${d.percentage}%`, backgroundColor: d.color, opacity: 0.8 }}></div>
                                            </div>
                                        </div>
                                    );
                                }) : <div className="h-full flex items-center justify-center text-[#8B93A1]">Aucun compte</div>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                    <h3 className="font-bold text-[#16233B] dark:text-white flex items-center gap-2"><PieChartIcon className="w-5 h-5 text-[#14603B]" /> Répartition des actifs</h3>
                    <LevelSelector level={level} onChange={setLevel} />
                </div>
                <p className="text-sm text-[#6E7685] dark:text-slate-400 mb-6">Vue circulaire par {level === 'class' ? "classe d'actifs" : 'sous-catégorie'} — la part « non précisé » regroupe les montants saisis sans sous-catégorie.</p>
                {donutData.length > 0 ? (
                    <div className="flex flex-col sm:flex-row items-center gap-8">
                        <div className="relative h-64 w-64 flex-shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={donutData} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={60} outerRadius={94} paddingAngle={2.5} cornerRadius={5} label={renderDonutLabel} labelLine={false} isAnimationActive={false}>
                                        {donutData.map((entry, index) => (<Cell key={`donut-${index}`} fill={entry.color} stroke="none" />))}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip darkMode={darkMode} formatter={(value) => privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)} />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-[10px] font-bold text-[#8B93A1] uppercase tracking-wider">Total</span>
                                <span className="text-lg font-bold text-[#16233B] dark:text-white"><BlurMoney amount={totalPatrimony} privacyMode={privacyMode} /></span>
                            </div>
                        </div>
                        <div className="w-full flex-1 space-y-2.5 min-w-0">
                            {donutData.map(d => (
                                <div key={d.type} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="flex items-center text-[#3C4A61] dark:text-slate-300 font-medium truncate min-w-0"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: d.color }}></div>{d.label}</span>
                                    <span className="font-bold text-[#16233B] dark:text-white whitespace-nowrap"><BlurMoney amount={d.value} privacyMode={privacyMode} /> <span className="text-[#8B93A1] font-normal">({d.percentage}%)</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : <p className="text-[#8B93A1] text-sm">Aucune donnée d'actif</p>}
            </div>

            <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="font-bold text-[#16233B] dark:text-white flex items-center gap-2"><PieChartIcon className="w-5 h-5 text-emerald-500" /> Allocation dans le temps</h3>
                    {allocationChart && <ChartLegend items={allocationChart.cats.map(c => ({ name: c.label, color: c.color }))} />}
                </div>
                <p className="text-sm text-[#6E7685] dark:text-slate-400 mb-6">Part de chaque {level === 'class' ? "classe d'actifs" : 'sous-catégorie'} à chaque fin de mois, d'après vos valorisations. Les comptes clôturés sortent de la répartition à leur clôture.</p>
                <div className="h-80">
                    {allocationChart ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={allocationChart.points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid {...gridStroke(darkMode)} />
                                <XAxis dataKey="label" tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickMargin={6} minTickGap={24} />
                                <YAxis width={48} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                                <Tooltip content={<ChartTooltip darkMode={darkMode} formatter={(value) => `${Number(value).toFixed(1)} %`} />} />
                                {allocationChart.cats.map(c => (
                                    <Area key={c.dataKey} isAnimationActive={false} type="monotone" dataKey={c.dataKey} name={c.label} stackId="alloc" stroke={c.color} strokeWidth={1.25} fill={c.color} fillOpacity={0.75} activeDot={{ r: 3 }} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-[#8B93A1] bg-[#F3F1EA] dark:bg-slate-700 rounded-xl">Pas assez de données : ajoutez des valorisations mensuelles</div>}
                </div>
            </div>

            <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-bold text-[#16233B] dark:text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#14603B]" /> Comparaison Benchmark</h3>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-[#6E7685] dark:text-slate-400">Indice :</label>
                        <select value={benchmarkSymbol} onChange={e => { setBenchmarkLoading(true); setBenchmarkSymbol(e.target.value); }} className="bg-[#FDFCF9] dark:bg-slate-700 border border-[#E1DCD0] dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-[#14603B] transition-all">
                            {BENCHMARK_OPTIONS.map(o => <option key={o.symbol} value={o.symbol}>{o.label}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-[#6E7685] dark:text-slate-400">Année :</label>
                        <select value={benchmarkChart?.activeYear ?? 'all'} onChange={e => setBenchmarkYear(e.target.value)} className="bg-[#FDFCF9] dark:bg-slate-700 border border-[#E1DCD0] dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-[#14603B] transition-all">
                            <option value="all">Tout</option>
                            {[...(benchmarkChart?.years || [])].sort((a, b) => b.localeCompare(a)).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
                {!benchmarkApiKey ? (
                    <div className="bg-[#EDF3EE] dark:bg-emerald-900/20 border border-[#DCE7DE] dark:border-emerald-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-[#14603B] flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-[#0F4C2F] dark:text-emerald-200">
                            <p className="font-bold">Clé API requise</p>
                            <p>Ajoutez votre clé gratuite Twelve Data (<span className="font-mono">VITE_TWELVEDATA_API_KEY</span>) dans l'onglet « Keys/API keys » pour activer la comparaison benchmark.</p>
                        </div>
                        <a href="https://twelvedata.com/pricing" target="_blank" rel="noreferrer" className="sm:ml-auto text-xs font-bold bg-[#14603B] text-white px-3 py-2 rounded-lg hover:bg-[#0F4C2F] whitespace-nowrap">Obtenir une clé gratuite</a>
                    </div>
                ) : benchmarkLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-[#B6BCC6] animate-spin" /></div>
                ) : benchmarkError ? (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-800 dark:text-red-200 flex-1">Impossible de charger l'indice {benchmarkLabel} : {benchmarkError}</p>
                        <button onClick={() => { setBenchmarkLoading(true); setBenchmarkRetry(r => r + 1); }} className="text-xs font-bold bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 whitespace-nowrap">Réessayer</button>
                    </div>
                ) : benchmarkChart && benchmarkChart.points ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                                <span className="w-2 h-2 rounded-full bg-[#14603B]"></span>Portefeuille
                                <span className="tabular-nums">{benchmarkChart.portfolioPct >= 0 ? '+' : ''}{benchmarkChart.portfolioPct.toFixed(1)} %</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/50">
                                <span className="w-2 h-2 rounded-full bg-[#9A6B2F]"></span>{benchmarkShort}
                                <span className="tabular-nums">{benchmarkChart.benchmarkPct >= 0 ? '+' : ''}{benchmarkChart.benchmarkPct.toFixed(1)} %</span>
                            </span>
                            <span className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${benchmarkChart.outperformance >= 0 ? 'bg-[#EDEAE0] text-[#2A3B55] dark:bg-slate-700 dark:text-slate-200' : 'bg-[#EDEAE0] text-[#2A3B55] dark:bg-slate-700 dark:text-slate-200'}`} title="Écart de performance entre le portefeuille et l'indice">
                                Écart {benchmarkChart.outperformance >= 0 ? '+' : ''}{benchmarkChart.outperformance.toFixed(1)} pts
                            </span>
                        </div>
                        <p className="text-xs text-[#6E7685] dark:text-slate-400 mb-3">{benchmarkChart.windowDesc}</p>
                        <ChartLegend className="mb-3" items={[{ name: 'Portefeuille (TWR)', color: '#14603B' }, { name: benchmarkShort, color: '#9A6B2F' }]} />
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={benchmarkChart.points} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradPort" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14603B" stopOpacity={0.18} /><stop offset="100%" stopColor="#14603B" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="gradBench" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9A6B2F" stopOpacity={0.14} /><stop offset="100%" stopColor="#9A6B2F" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="0" {...gridStroke(darkMode)} />
                                    <XAxis dataKey="label" tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickMargin={6} minTickGap={24} />
                                    <YAxis width={56} domain={[(min) => Math.max(0, Math.floor(Math.min(min, 100) / 10) * 10 - 5), (max) => Math.ceil(Math.max(max, 100) / 10) * 10 + 5]} tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v)}`} />
                                    <Tooltip content={<ChartTooltip darkMode={darkMode} formatter={(value) => `${Number(value).toFixed(1)}`} />} />
                                    <ReferenceLine y={100} stroke={darkMode ? '#475569' : '#D8D2C4'} strokeDasharray="4 4" label={{ value: 'Base 100', position: 'insideTopLeft', fontSize: 10, fill: darkMode ? '#6E7685' : '#8B93A1' }} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="portefeuille" name="Portefeuille" stroke="#14603B" strokeWidth={2.5} fill="url(#gradPort)" fillOpacity={1} dot={false} activeDot={{ r: 5 }} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="benchmark" name={benchmarkShort} stroke="#9A6B2F" strokeWidth={2} strokeDasharray="6 3" fill="url(#gradBench)" fillOpacity={1} dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                ) : benchmarkChart ? (
                    <div className="text-center py-12 text-[#8B93A1] text-sm">Pas assez de données pour tracer l'année {benchmarkChart.activeYear} — ajoutez des valorisations mensuelles.</div>
                ) : (
                    <div className="text-center py-12 text-[#8B93A1] text-sm">Données insuffisantes : ajoutez au moins 2 valorisations pour comparer.</div>
                )}
            </div>

            <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-2xl border border-[#E4E0D6] dark:border-slate-700 shadow-none">
                <h3 className="font-bold mb-6 flex items-center gap-2 text-lg text-[#16233B] dark:text-white"><BarChart3 className="w-5 h-5 text-[#1B2A41]" /> Répartition des actifs par enveloppe</h3>
                <div className="h-80">
                    {crossDistributionData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={crossDistributionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="22%">
                                <CartesianGrid {...gridStroke(darkMode)} />
                                <XAxis dataKey="name" tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickMargin={8} interval={0} angle={-18} height={58} />
                                <YAxis width={56} tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickFormatter={v => privacyMode ? '***' : formatCompactAxis(v)} />
                                <Tooltip
                                    cursor={{ fill: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                                    content={<ChartTooltip darkMode={darkMode} formatter={(value, entry) => {
                                        if (entry.name === 'total' || privacyMode) return null;
                                        const percentage = entry.payload?.total ? ((value / entry.payload.total) * 100).toFixed(1) : null;
                                        return (
                                            <span className="flex flex-col items-end">
                                                <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)}</span>
                                                {percentage !== null && <span className="text-[10px] opacity-70">{percentage}% de la classe d'actif</span>}
                                            </span>
                                        );
                                    }} />}
                                />
                                {accountIds.map((id, i) => (
                                    <Bar
                                        key={id}
                                        dataKey={id}
                                        name={accountNames[id]}
                                        stackId="a"
                                        fill={accountColors[id]}
                                        radius={i === accountIds.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                                        isAnimationActive={false}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-[#8B93A1] bg-[#F3F1EA] dark:bg-slate-700 rounded-xl">Pas de données d'actifs</div>}
                </div>
            </div>
        </div>
    );
};