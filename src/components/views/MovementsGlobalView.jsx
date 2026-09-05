// --- VUE : RÉCAPITULATIF DES MOUVEMENTS ---
// Composant autonome (props brokers/privacyMode), extrait du fichier principal (axe 2 de l'audit).
import { useState, useMemo } from "react";
import { History, ArrowUpCircle, Percent, ArrowDownCircle } from "lucide-react";
import { BlurMoney } from "../ui.jsx";
import { CURRENCIES } from "../../utils/constantes.js";

export const MovementsGlobalView = ({ brokers, privacyMode }) => {
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
