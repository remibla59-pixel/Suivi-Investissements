// --- VUE : TABLEAU DE BORD ---
// Objectif patrimonial, indicateurs globaux, évolution et répartitions (extraite du fichier principal, axe 2 de l'audit).
import { useMemo, useState, useEffect } from "react";
import { Target, TrendingUp, TrendingDown, PieChart as PieChartIcon, BarChart3, Gauge, ShieldCheck, Activity, AlertTriangle, Loader2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ReferenceLine, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getNetInvestedUntilDate, processMonthlyStats, calculateSharpeRatio, formatCompactAxis } from "../../utils/calculs.js";
import { BlurMoney, PerformanceBadge, ChartTooltip, ChartLegend, axisTickProps, gridStroke } from "../ui.jsx";
import { BENCHMARK_OPTIONS, getBenchmarkApiKey, fetchBenchmarkMonthly } from "../../utils/marketData.js";

export const Dashboard = ({ brokers, privacyMode, darkMode, totalPatrimony, patrimonyGoal, totalInvestedGlobal, totalNetGainLoss, globalTRI, twr, globalCategoryDistribution, globalAccountTypeDistribution, crossDistributionData, targetAllocation, openModal }) => {
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
            monthKey: date.slice(0, 7), 
            valeur: totalAtDate, 
            investi: investedAtDate > 0 ? investedAtDate : 0 
        };
    });
    const progress = Math.min((totalPatrimony / patrimonyGoal) * 100, 100);
    const accountIds = [...new Set(brokers.flatMap(b => b.accounts.map(a => a.id)))];
    const accountNames = {};
    const accountColors = {};
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#14B8A6', '#6B7280'];
    
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
    // tous deux ramenés à 100 au premier mois commun.
    const benchmarkChart = useMemo(() => {
        if (!benchmarkData || !benchmarkData.length) return null;
        const stats = processMonthlyStats(brokers);
        if (stats.length < 2) return null;
        const benchByMonth = new Map(benchmarkData.map(p => [p.date.slice(0, 7), p.close]));
        const statsByMonth = new Map(stats.map(s => [s.month, s]));
        const months = [...statsByMonth.keys()].filter(m => benchByMonth.has(m));
        if (months.length < 2) return null;

        let cum = 1;
        let startCum = null;
        const startBench = benchByMonth.get(months[0]);
        const points = [];
        months.forEach(month => {
            const stat = statsByMonth.get(month);
            const r = 1 + parseFloat(stat.yield) / 100;
            if (!isFinite(r) || r <= 0) return;
            cum *= r;
            if (startCum === null) startCum = cum;
            points.push({
                month,
                label: stat.displayDate,
                portefeuille: (cum / startCum) * 100,
                benchmark: (benchByMonth.get(month) / startBench) * 100,
            });
        });
        if (points.length < 2) return null;
        const last = points[points.length - 1];
        return { points, outperformance: last.portefeuille - last.benchmark, portfolioPct: last.portefeuille - 100, benchmarkPct: last.benchmark - 100 };
    }, [benchmarkData, brokers]);

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

    // Données du donut (catégories à valeur positive)
    const donutData = useMemo(() => globalCategoryDistribution.filter(d => d.value > 0), [globalCategoryDistribution]);

    // Étiquettes à l'intérieur de la couronne : nom + % pour les parts lisibles
    const renderDonutLabel = (props) => {
        const { cx, cy, midAngle, innerRadius, outerRadius, percent, payload } = props;
        if (!payload || (percent || 0) * 100 < 5) return null;
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return (
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={700} fill={darkMode ? '#E2E8F0' : '#334155'}>
                {payload.label} · {(percent * 100).toFixed(0)}%
            </text>
        );
    };

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
                    <div className="text-3xl font-bold"><PerformanceBadge current={totalPatrimony} invested={totalInvestedGlobal} tri={globalTRI} twr={twr} /></div>
                </div>
            </div>

            {rebalanceAlerts.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-amber-200 dark:border-amber-800/60 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Alertes de rééquilibrage</h3>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{rebalanceAlerts.length} alerte{rebalanceAlerts.length > 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rebalanceAlerts.map(a => {
                        const idealAmount = totalPatrimony * (a.targetPct / 100);
                        const delta = idealAmount - a.value;
                        return (
                            <div key={a.type} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }}></div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm text-gray-800 dark:text-white truncate">{a.label}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Actuel {a.percentage}% · Cible {a.targetPct}%</div>
                                    </div>
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap ${delta > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {delta > 0 ? 'Acheter' : 'Vendre'} <BlurMoney amount={Math.abs(delta)} privacyMode={privacyMode} />
                                </span>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Seuil de tolérance : ±5 points de pourcentage par rapport à l'allocation cible.</p>
            </div>
            )}
            {riskStats && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg">
                <h3 className="font-bold mb-5 text-gray-800 dark:text-white flex items-center gap-2"><Activity className="w-5 h-5 text-rose-500" /> Indicateurs de risque</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"><TrendingDown className="w-4 h-4" /> Drawdown max</div>
                        <div className={`text-2xl font-bold ${riskStats.maxDrawdown <= -15 ? 'text-red-600 dark:text-red-400' : riskStats.maxDrawdown <= -7 ? 'text-orange-500 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>{riskStats.maxDrawdown.toFixed(1)}%</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Baisse maximale depuis un sommet</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"><Gauge className="w-4 h-4" /> Volatilité annualisée</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{riskStats.volatility.toFixed(1)}%</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Écart-type des rendements mensuels</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"><ShieldCheck className="w-4 h-4" /> Ratio de Sharpe</div>
                        <div className={`text-2xl font-bold ${riskStats.sharpe >= 1 ? 'text-green-600 dark:text-green-400' : riskStats.sharpe >= 0.5 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400'}`}>{riskStats.sharpe !== null ? riskStats.sharpe.toFixed(2) : '—'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Rendement ajusté du risque</div>
                    </div>
                </div>
            </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                        <h3 className="font-bold flex items-center gap-2 text-lg text-gray-800 dark:text-white"><TrendingUp className="w-5 h-5 text-green-500" /> Évolution : Épargne vs Intérêts</h3>
                        <ChartLegend items={[{ name: 'Valeur Totale', color: '#10B981' }, { name: 'Capital Investi', color: '#64748B' }]} />
                    </div>
                    <div className="h-72">
                        {evolution.length > 1 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={evolution}>
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.22} /><stop offset="100%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#64748B" stopOpacity={0.12} /><stop offset="100%" stopColor="#64748B" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid {...gridStroke(darkMode)} />
                                    <XAxis dataKey="date" tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickMargin={6} minTickGap={24} />
                                    <YAxis width={56} domain={['dataMin', 'dataMax']} tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickFormatter={v => privacyMode ? '***' : formatCompactAxis(v)} />
                                    <Tooltip content={<ChartTooltip darkMode={darkMode} formatter={(value) => privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)} />} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="valeur" name="Valeur Totale" stroke="#10B981" strokeWidth={2.25} fillOpacity={1} fill="url(#colorVal)" activeDot={{ r: 4 }} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="investi" name="Capital Investi" stroke="#64748B" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorInv)" activeDot={{ r: 4 }} />
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
                <h3 className="font-bold mb-1 text-gray-800 dark:text-white flex items-center gap-2"><PieChartIcon className="w-5 h-5 text-blue-500" /> Répartition des actifs</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Vue circulaire par type d'actif</p>
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
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total</span>
                                <span className="text-lg font-bold text-gray-900 dark:text-white"><BlurMoney amount={totalPatrimony} privacyMode={privacyMode} /></span>
                            </div>
                        </div>
                        <div className="w-full flex-1 space-y-2.5 min-w-0">
                            {donutData.map(d => (
                                <div key={d.type} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="flex items-center text-gray-600 dark:text-gray-300 font-medium truncate min-w-0"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: d.color }}></div>{d.label}</span>
                                    <span className="font-bold text-gray-800 dark:text-white whitespace-nowrap"><BlurMoney amount={d.value} privacyMode={privacyMode} /> <span className="text-gray-400 font-normal">({d.percentage}%)</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : <p className="text-gray-400 text-sm">Aucune donnée d'actif</p>}
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Comparaison Benchmark</h3>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">Indice :</label>
                        <select value={benchmarkSymbol} onChange={e => { setBenchmarkLoading(true); setBenchmarkSymbol(e.target.value); }} className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            {BENCHMARK_OPTIONS.map(o => <option key={o.symbol} value={o.symbol}>{o.label}</option>)}
                        </select>
                    </div>
                </div>
                {!benchmarkApiKey ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900 dark:text-blue-200">
                            <p className="font-bold">Clé API requise</p>
                            <p>Ajoutez votre clé gratuite Twelve Data (<span className="font-mono">VITE_TWELVEDATA_API_KEY</span>) dans l'onglet « Keys/API keys » pour activer la comparaison benchmark.</p>
                        </div>
                        <a href="https://twelvedata.com/pricing" target="_blank" rel="noreferrer" className="sm:ml-auto text-xs font-bold bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 whitespace-nowrap">Obtenir une clé gratuite</a>
                    </div>
                ) : benchmarkLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-gray-300 animate-spin" /></div>
                ) : benchmarkError ? (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-800 dark:text-red-200 flex-1">Impossible de charger l'indice {benchmarkLabel} : {benchmarkError}</p>
                        <button onClick={() => { setBenchmarkLoading(true); setBenchmarkRetry(r => r + 1); }} className="text-xs font-bold bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 whitespace-nowrap">Réessayer</button>
                    </div>
                ) : benchmarkChart ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                                <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>Portefeuille
                                <span className="tabular-nums">{benchmarkChart.portfolioPct >= 0 ? '+' : ''}{benchmarkChart.portfolioPct.toFixed(1)} %</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/50">
                                <span className="w-2 h-2 rounded-full bg-[#8B5CF6]"></span>{benchmarkShort}
                                <span className="tabular-nums">{benchmarkChart.benchmarkPct >= 0 ? '+' : ''}{benchmarkChart.benchmarkPct.toFixed(1)} %</span>
                            </span>
                            <span className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${benchmarkChart.outperformance >= 0 ? 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200' : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200'}`} title="Écart de performance entre le portefeuille et l'indice">
                                Écart {benchmarkChart.outperformance >= 0 ? '+' : ''}{benchmarkChart.outperformance.toFixed(1)} pts
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Performance nette des flux vs indice — base 100 au premier mois commun ({benchmarkChart.points[0].label})</p>
                        <ChartLegend className="mb-3" items={[{ name: 'Portefeuille (TWR)', color: '#10B981' }, { name: benchmarkShort, color: '#8B5CF6' }]} />
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={benchmarkChart.points} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradPort" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.18} /><stop offset="100%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="gradBench" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.14} /><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="0" {...gridStroke(darkMode)} />
                                    <XAxis dataKey="label" tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickMargin={6} minTickGap={24} />
                                    <YAxis width={56} domain={[(min) => Math.max(0, Math.floor(Math.min(min, 100) / 10) * 10 - 5), (max) => Math.ceil(Math.max(max, 100) / 10) * 10 + 5]} tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v)}`} />
                                    <Tooltip content={<ChartTooltip darkMode={darkMode} formatter={(value) => `${Number(value).toFixed(1)}`} />} />
                                    <ReferenceLine y={100} stroke={darkMode ? '#475569' : '#CBD5E1'} strokeDasharray="4 4" label={{ value: 'Base 100', position: 'insideTopLeft', fontSize: 10, fill: darkMode ? '#64748B' : '#94A3B8' }} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="portefeuille" name="Portefeuille" stroke="#10B981" strokeWidth={2.5} fill="url(#gradPort)" fillOpacity={1} dot={false} activeDot={{ r: 5 }} />
                                    <Area isAnimationActive={false} type="monotone" dataKey="benchmark" name={benchmarkShort} stroke="#8B5CF6" strokeWidth={2} strokeDasharray="6 3" fill="url(#gradBench)" fillOpacity={1} dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-12 text-gray-400 text-sm">Données insuffisantes : ajoutez au moins 2 valorisations pour comparer.</div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg">
                <h3 className="font-bold mb-6 flex items-center gap-2 text-lg text-gray-800 dark:text-white"><BarChart3 className="w-5 h-5 text-indigo-500" /> Répartition des actifs par enveloppe</h3>
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
                    ) : <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-slate-700 rounded-xl">Pas de données d'actifs</div>}
                </div>
            </div>
        </div>
    );
};