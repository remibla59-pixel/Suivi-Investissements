// --- VUE : SIMULATEUR & COMPARATEUR ---
// Composant autonome (props + état local uniquement), extrait du fichier principal (axe 2 de l'audit).
import { useState, useMemo } from "react";
import { Calculator, Flag } from "lucide-react";
import { AreaChart, Area, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { BlurMoney, inputClass, labelClass, ChartTooltip, ChartLegend, axisTickProps, gridStroke } from "../ui.jsx";
import { formatCompactAxis } from "../../utils/calculs.js";

export const SimulationView = ({ currentTotal, globalTRI, globalTWR, patrimonyGoal, privacyMode, darkMode }) => {
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
                <div className="bg-[#1B2A41] p-2 rounded-lg text-white"><Calculator className="w-6 h-6" /></div>
                <h2 className="text-2xl font-bold text-[#16233B] dark:text-white">Simulateur & Comparateur</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4 lg:col-span-3 space-y-4">
                    <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-xl border border-[#E4E0D6] dark:border-slate-700 shadow-none space-y-4">
                        <h3 className="font-bold text-[#16233B] dark:text-white border-b border-[#E4E0D6] dark:border-slate-700 pb-2">Paramètres</h3>
                        <div><label className={labelClass}>Apport Initial</label><div className={`${inputClass} bg-[#EDEAE0] dark:bg-slate-900 opacity-70 flex items-center`}><BlurMoney amount={currentTotal.toFixed(0)} privacyMode={privacyMode} /></div></div>
                        <div><label className={labelClass}>Épargne Mensuelle (€)</label><input type="number" value={monthlyContribution} onChange={e => setMonthlyContribution(parseFloat(e.target.value) || 0)} className={inputClass} /></div>
                        <div><label className={labelClass}>Rendement Cible (%)</label><input type="number" step="0.1" value={expectedReturn} onChange={e => setExpectedReturn(parseFloat(e.target.value) || 0)} className={inputClass} /></div>
                        <div><label className={labelClass}>Durée (Années)</label><input type="range" min="1" max="40" value={years} onChange={e => setYears(parseInt(e.target.value))} className="w-full h-2 bg-[#E4E0D6] rounded-lg appearance-none cursor-pointer dark:bg-slate-700" /><div className="text-center font-bold mt-2 text-[#14603B] dark:text-emerald-400">{years} ans</div></div>
                        <div className="pt-2 border-t border-[#E4E0D6] dark:border-slate-700"><div className="flex justify-between items-center mb-1"><label className="text-xs font-bold text-[#6E7685]">Objectif (Ligne Rouge)</label><span className="text-xs font-bold text-red-500"><BlurMoney amount={patrimonyGoal} privacyMode={privacyMode} /></span></div></div>
                    </div>
                </div>
                <div className="md:col-span-8 lg:col-span-9 space-y-6">
                    <div className="bg-[#F3F1EA] dark:bg-slate-800 p-4 rounded-xl border border-[#E1DCD0] dark:border-slate-600 flex flex-col sm:flex-row gap-4 items-center justify-between">
                         <div className="flex items-center gap-3"><div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full"><Flag className="w-5 h-5 text-red-600 dark:text-red-400" /></div><div><div className="text-sm font-bold text-[#6E7685] dark:text-slate-400">Objectif : <BlurMoney amount={patrimonyGoal} privacyMode={privacyMode} /></div><div className="font-bold text-[#16233B] dark:text-white">{goalHitTarget ? `Atteint dans ${goalHitTarget} ans (Scénario Cible)` : <span className="text-orange-500">Non atteint sur {years} ans (Cible)</span>}</div></div></div>
                         {globalTRI && (<div className="text-right border-l pl-4 border-[#E1DCD0] dark:border-slate-600"><div className="text-xs text-[#6E7685] dark:text-slate-400">Selon historique ({globalTRI.toFixed(1)}% TRI{globalTWR ? ` · ${globalTWR.toFixed(1)}% TWR` : ''})</div><div className="font-bold text-[#9A6B2F] dark:text-amber-300">{goalHitHistorical ? `Atteint dans ${goalHitHistorical} ans` : 'Non atteint'}</div></div>)}
                    </div>
                    <div className="bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-xl border border-[#E4E0D6] dark:border-slate-700 shadow-none">
                        <ChartLegend className="mb-3" items={[{ name: `Scénario Cible (${expectedReturn}%)`, color: '#1F4E79' }, ...(globalTRI ? [{ name: `Scénario Historique (${globalTRI.toFixed(1)}%)`, color: '#9A6B2F' }] : []), { name: 'Capital Versé', color: '#14603B' }]} />
                    <div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1F4E79" stopOpacity={0.28}/><stop offset="100%" stopColor="#1F4E79" stopOpacity={0}/></linearGradient><linearGradient id="colorHist" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9A6B2F" stopOpacity={0.24}/><stop offset="100%" stopColor="#9A6B2F" stopOpacity={0}/></linearGradient></defs><CartesianGrid {...gridStroke(darkMode)} /><XAxis dataKey="year" tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} interval={years > 10 ? 4 : 1} tickMargin={6} /><YAxis width={54} domain={['dataMin', 'dataMax']} tick={{ ...axisTickProps(darkMode) }} axisLine={false} tickLine={false} tickFormatter={v => privacyMode ? '****' : formatCompactAxis(v)} /><Tooltip content={<ChartTooltip darkMode={darkMode} formatter={(value) => privacyMode ? '**** €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)} />} /><ReferenceLine y={patrimonyGoal} stroke="#8C2F39" strokeDasharray="4 4" label={{ value: 'Objectif', position: 'insideTopRight', fontSize: 10, fill: '#8C2F39' }} /><Area type="monotone" dataKey="capitalTarget" name={`Scénario Cible (${expectedReturn}%)`} stroke="#1F4E79" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTarget)" isAnimationActive={false} activeDot={{ r: 4 }} />{globalTRI && <Area type="monotone" dataKey="capitalHistorical" name={`Scénario Historique (${globalTRI.toFixed(1)}%)`} stroke="#9A6B2F" strokeWidth={2.5} fillOpacity={1} fill="url(#colorHist)" isAnimationActive={false} activeDot={{ r: 4 }} />}<Line type="monotone" dataKey="invested" name="Capital Versé" stroke="#14603B" strokeDasharray="5 5" strokeWidth={2} isAnimationActive={false} dot={false} /></AreaChart></ResponsiveContainer></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-[#F3F1EA] dark:bg-slate-700/50 p-4 rounded-xl border border-[#E1DCD0] dark:border-slate-600"><div className="text-sm text-[#6E7685] dark:text-slate-400 mb-1">Capital Investi (Total)</div><div className="text-2xl font-bold text-[#2A3B55] dark:text-slate-200"><BlurMoney amount={finalInvested} privacyMode={privacyMode} /></div></div>
                        <div className="bg-[#EDF3EE] dark:bg-emerald-900/20 p-4 rounded-xl border border-[#DCE7DE] dark:border-emerald-800"><div className="text-sm text-[#0F4C2F] dark:text-emerald-300 mb-1">Final (Scénario Cible)</div><div className="text-2xl font-bold text-[#14603B] dark:text-emerald-400"><BlurMoney amount={finalTarget} privacyMode={privacyMode} /></div></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
