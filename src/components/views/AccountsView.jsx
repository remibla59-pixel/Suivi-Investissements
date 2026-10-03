// --- VUE : COMPTES D'UN COURTIER ---
// Liste des comptes d'un courtier sélectionné avec valorisations (extraite du fichier principal, axe 2 de l'audit).
// Les comptes clôturés sont regroupés en bas : ils ne comptent plus dans les totaux,
// mais tout leur historique reste consultable et ils peuvent être réouverts.
import { ArrowLeft, PlusCircle, Wallet, Edit2, Trash2, ChevronRight, Archive, RotateCcw } from "lucide-react";
import { ACCOUNT_TYPES, CURRENCIES } from "../../utils/constantes.js";
import { BlurMoney, PerformanceBadge } from "../ui.jsx";

const formatClosedDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

export const AccountsView = ({ selectedBroker, privacyMode, getSortedAccounts, getTotalByBrokerInEur, getAccountInvestedTotalRaw, getAccountCurrentValueRaw, onBack, onAddAccount, onEditAccount, onDeleteAccount, onCloseAccount, onReopenAccount, onSelectAccount }) => {
    const sortedAccounts = getSortedAccounts(selectedBroker.accounts);
    const activeAccounts = sortedAccounts.filter(a => !a.closed);
    const closedAccounts = sortedAccounts.filter(a => a.closed);
    const renderAccount = (acc, isClosed) => {
        const type = ACCOUNT_TYPES.find(t => t.value === acc.type);
        const currency = acc.currency || 'EUR';
        const symbol = CURRENCIES.find(c => c.code === currency)?.symbol || '€';
        const investedTotal = getAccountInvestedTotalRaw(acc);
        const closedLabel = formatClosedDate(acc.closedDate);
        return (
          <div key={acc.id} onClick={() => { onSelectAccount(acc); }} className={`bg-[#FDFCF9] dark:bg-slate-800 p-6 rounded-xl border border-[#E4E0D6] dark:border-slate-700 shadow-none hover:border-[#14603B]/40 dark:hover:border-emerald-800 cursor-pointer flex justify-between items-center group transition-all ${isClosed ? 'opacity-80 hover:opacity-100' : ''}`}>
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F3F1EA] dark:bg-slate-700 border dark:border-slate-600" style={{color: isClosed ? '#8B93A1' : type?.color}}><Wallet className="w-7 h-7" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h4 className={`font-bold text-lg ${isClosed ? 'text-[#6E7685] dark:text-slate-400' : 'text-[#16233B] dark:text-white'}`}>{acc.name}</h4>
                  <span className="text-xs bg-[#EDEAE0] dark:bg-slate-700 px-2 py-0.5 rounded-full text-[#3C4A61] dark:text-slate-300 font-medium border dark:border-slate-600">{type?.label}</span>
                  {currency !== 'EUR' && <span className="text-xs bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 px-2 py-0.5 rounded-full text-orange-700 dark:text-orange-300 font-bold">{currency}</span>}
                  {isClosed && <span className="text-xs bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full text-amber-700 dark:text-amber-300 font-bold">Clôturé{closedLabel ? ` le ${closedLabel}` : ''}</span>}
                </div>
                {isClosed ? (
                  <div className="text-sm text-[#6E7685] dark:text-slate-400">
                    Dernière valeur : <span className="font-bold text-[#6E7685] dark:text-slate-300"><BlurMoney amount={getAccountCurrentValueRaw(acc)} currency={symbol} privacyMode={privacyMode} /></span> · historique conservé
                  </div>
                ) : (
                  <div className="flex items-baseline gap-3">
                    <span className="text-xl font-bold text-[#16233B] dark:text-slate-200"><BlurMoney amount={getAccountCurrentValueRaw(acc)} currency={symbol} privacyMode={privacyMode} /></span>
                    <PerformanceBadge current={getAccountCurrentValueRaw(acc)} invested={investedTotal} tri={acc.tri} twr={acc.twr} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isClosed ? (
                <button onClick={e => { e.stopPropagation(); onReopenAccount(selectedBroker.id, acc.id); }} title="Réouvrir ce compte" className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"><RotateCcw className="w-4 h-4" /> Réouvrir</button>
              ) : (
                <button onClick={e => { e.stopPropagation(); onCloseAccount(selectedBroker.id, acc.id); }} title="Clôturer ce compte (l'historique est conservé)" className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg text-[#8B93A1] hover:text-amber-600 dark:hover:text-amber-400 transition-colors"><Archive className="w-4 h-4" /></button>
              )}
              <button onClick={e => { e.stopPropagation(); onEditAccount(acc); }} className="p-2 hover:bg-[#EDEAE0] dark:hover:bg-slate-600 rounded-lg text-[#8B93A1] hover:text-[#14603B] dark:hover:text-[#14603B]"><Edit2 className="w-4 h-4" /></button>
              <button onClick={e => { e.stopPropagation(); onDeleteAccount(selectedBroker.id, acc.id); }} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-[#8B93A1] hover:text-red-500 dark:hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              <ChevronRight className="w-5 h-5 text-[#B6BCC6] dark:text-slate-500 ml-2" />
            </div>
          </div>
        );
    };
    return (
      <div className="space-y-6 w-full animate-fade-in">
        <div className="flex items-center gap-4"><button onClick={() => { onBack(); }} className="p-2 hover:bg-[#FDFCF9] dark:hover:bg-slate-800 rounded-lg border border-[#E1DCD0] dark:border-slate-700 text-[#3C4A61] dark:text-slate-300"><ArrowLeft className="w-6 h-6" /></button><div><h2 className="text-2xl font-bold text-[#16233B] dark:text-white">{selectedBroker.name}</h2></div></div>
        <div className="bg-[#1B2A41] p-8 rounded-2xl text-[#F6F4EE] shadow-none flex justify-between items-center"><div><div className="kicker !text-[#C9CFD8] mb-2">Valorisation totale (EUR)</div><div className="text-5xl font-bold"><BlurMoney amount={getTotalByBrokerInEur(selectedBroker)} privacyMode={privacyMode} /></div>{closedAccounts.length > 0 && <div className="text-[#C9CFD8]/80 text-xs font-medium mt-2">{closedAccounts.length} compte(s) clôturé(s) non compté(s)</div>}</div><div className="hidden sm:block p-4 bg-[#FDFCF9]/10 rounded-2xl"><Wallet className="w-12 h-12 text-white" /></div></div>
        <div className="flex justify-between items-center mt-8"><h3 className="text-xl font-bold text-[#16233B] dark:text-white">Comptes</h3><div className="flex items-center gap-3"><button onClick={() => onAddAccount()} className="flex items-center gap-2 bg-[#FDFCF9] dark:bg-slate-800 border border-[#E1DCD0] dark:border-slate-700 px-4 py-2 rounded-lg shadow-sm text-[#2A3B55] dark:text-slate-200 hover:bg-[#F3F1EA] dark:hover:bg-slate-700"><PlusCircle className="w-5 h-5 text-[#14603B]" /> Nouveau compte</button></div></div>
        <div className="grid gap-4">{activeAccounts.map(acc => renderAccount(acc, false))}</div>
        {!activeAccounts.length && <div className="text-center py-10 bg-[#FDFCF9] dark:bg-slate-800 rounded-xl border-2 border-dashed border-[#D8D2C4] dark:border-slate-700 text-[#6E7685] dark:text-slate-400">Aucun compte actif</div>}
        {closedAccounts.length > 0 && (
          <div className="pt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Archive className="w-5 h-5 text-[#8B93A1]" />
              <h3 className="text-lg font-bold text-[#6E7685] dark:text-slate-400">Comptes clôturés</h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#EDEAE0] dark:bg-slate-700 text-[#6E7685] dark:text-slate-400">{closedAccounts.length}</span>
            </div>
            <p className="text-sm text-[#8B93A1] dark:text-slate-500 -mt-2">Exclus des totaux actuels et de la répartition. Cliquez sur un compte pour consulter son historique, ou réouvrez-le pour reprendre le suivi.</p>
            <div className="grid gap-4">{closedAccounts.map(acc => renderAccount(acc, true))}</div>
          </div>
        )}
      </div>
    );
};
