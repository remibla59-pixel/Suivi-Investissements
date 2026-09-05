// --- VUE : RAPPORT MENSUEL / HISTORIQUE ---
// Composant autonome (props brokers/darkMode/privacyMode), extrait du fichier principal (axe 2 de l'audit).
import { useState, useMemo } from "react";
import { History, Calendar, TrendingUp } from "lucide-react";
import { ComposedChart, Bar, BarChart, Line, Cell, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";
import { BlurMoney } from "../ui.jsx";
import { processMonthlyStats, calculateTWR, annualizeReturn, formatCompactAxis } from "../../utils/calculs.js";

export const HistoryView = ({ brokers, darkMode, privacyMode }) => {
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

    // --- PERFORMANCE GLOBALE DE LA PÉRIODE SÉLECTIONNÉE ---
    const periodSummary = useMemo(() => {
        if (!stats.length) return null;
        const first = stats[0];
        const last = stats[stats.length - 1];

        // Valeur au début de la période : celle du mois précédent si elle existe
        const firstIdx = fullStats.findIndex(s => s.month === first.month);
        const prev = firstIdx > 0 ? fullStats[firstIdx - 1] : null;
        const startValue = prev ? prev.value : 0;

        const endValue = last.value;
        const totalFlows = stats.reduce((sum, s) => sum + s.flow, 0);
        const performance = endValue - startValue - totalFlows;

        let avgCapital = startValue + totalFlows / 2;
        if (Math.abs(avgCapital) < 1) avgCapital = endValue;

        const yieldPct = avgCapital !== 0 ? (performance / avgCapital) * 100 : 0;
        const months = stats.length;
        const twr = calculateTWR(stats.map(s => s.yield));
        const twrAnnualized = annualizeReturn(twr, months);

        return { startValue, endValue, totalFlows, performance, yieldPct, months, twr, twrAnnualized };
    }, [stats, fullStats]);

    // Données du graphique en cascade (bridge) : Départ → Flux → Performance → Final
    const waterfallData = useMemo(() => {
        if (!periodSummary) return [];
        const { startValue, totalFlows, performance, endValue } = periodSummary;
        return [
            { name: 'Départ', base: 0, value: startValue, fill: '#64748B' },
            { name: 'Flux nets', base: startValue, value: totalFlows, fill: totalFlows >= 0 ? '#3B82F6' : '#F59E0B' },
            { name: 'Performance', base: startValue + totalFlows, value: performance, fill: performance >= 0 ? '#10B981' : '#EF4444' },
            { name: 'Valeur finale', base: 0, value: endValue, fill: '#8B5CF6' },
        ];
    }, [periodSummary]);

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
             {periodSummary && (
             <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500" /> Performance Globale de la Période</h3>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">{periodSummary.months} mois</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valeur de départ</div>
                        <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white"><BlurMoney amount={periodSummary.startValue} privacyMode={privacyMode} /></div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Flux nets</div>
                        <div className={`text-xl sm:text-2xl font-bold ${periodSummary.totalFlows >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-500 dark:text-orange-400'}`}>{periodSummary.totalFlows > 0 ? '+' : ''}<BlurMoney amount={periodSummary.totalFlows} privacyMode={privacyMode} /></div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Performance nette</div>
                        <div className={`text-xl sm:text-2xl font-bold ${periodSummary.performance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{periodSummary.performance > 0 ? '+' : ''}<BlurMoney amount={periodSummary.performance} privacyMode={privacyMode} /></div>
                        <div className="text-xs font-semibold mt-1 text-gray-500 dark:text-gray-400">{periodSummary.yieldPct >= 0 ? '+' : ''}{periodSummary.yieldPct.toFixed(1)}% sur la période</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">TWR (période)</div>
                        <div className={`text-xl sm:text-2xl font-bold ${periodSummary.twr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{periodSummary.twr > 0 ? '+' : ''}{periodSummary.twr.toFixed(2)}%</div>
                        <div className="text-xs font-semibold mt-1 text-gray-500 dark:text-gray-400">{periodSummary.twrAnnualized !== null ? `Soit ${periodSummary.twrAnnualized >= 0 ? '+' : ''}${periodSummary.twrAnnualized.toFixed(1)}% / an` : 'Rendement annualisé indisponible'}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valeur finale</div>
                        <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white"><BlurMoney amount={periodSummary.endValue} privacyMode={privacyMode} /></div>
                    </div>
                </div>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={waterfallData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" fontSize={12} stroke="#9CA3AF" />
                            <YAxis width={70} fontSize={12} stroke="#9CA3AF" tickFormatter={v => privacyMode ? '***' : formatCompactAxis(v, '€')} />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#fff' : '#000', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value, name) => name === 'Socle' ? null : [privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value), name]}
                            />
                            <Bar dataKey="base" name="Socle" stackId="perf" fill="transparent" tooltipType="none" isAnimationActive={false} />
                            <Bar dataKey="value" name="Montant" stackId="perf" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                {waterfallData.map((entry, index) => (<Cell key={`wf-${index}`} fill={entry.fill} />))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
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
            <YAxis yAxisId="left" width={70} fontSize={12} stroke="#9CA3AF" tickFormatter={v => privacyMode ? '***' : formatCompactAxis(v, '€')} />
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
