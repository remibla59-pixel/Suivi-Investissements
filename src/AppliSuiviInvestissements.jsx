import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PlusCircle, Trash2, Edit2, Wallet, Download, Upload, ArrowDownCircle, ArrowUpCircle, LogOut, Loader2, Save, Moon, Sun, ArrowRightLeft, Percent, RotateCcw, Eye, EyeOff, AlertCircle } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { calculateXIRR, getNetInvestedUntilDate, processMonthlyStats, calculateTWR, annualizeReturn, calculateTWRFromSnapshots } from "./utils/calculs.js";
import { INVESTMENT_CATEGORIES, ACCOUNT_TYPES, CURRENCIES } from "./utils/constantes.js";
import { BlurMoney, Toast, Modal, inputClass, labelClass } from "./components/ui.jsx";
import { SimulationView } from "./components/views/SimulationView.jsx";
import { MovementsGlobalView } from "./components/views/MovementsGlobalView.jsx";
import { HistoryView } from "./components/views/HistoryView.jsx";
import { BrokersView } from "./components/views/BrokersView.jsx";
import { AccountsView } from "./components/views/AccountsView.jsx";
import { SnapshotsView } from "./components/views/SnapshotsView.jsx";
import { Dashboard } from "./components/views/Dashboard.jsx";
import { BrokerForm, AccountForm, MovementForm, TransferForm, SnapshotForm, TargetAllocationForm } from "./components/forms.jsx";

// --- CONFIGURATION FIREBASE ---
// Les identifiants Firebase sont injectés via les variables VITE_FIREBASE_*
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialisation conditionnelle
let auth, db, provider;
let firebaseInitError = null;
try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
} catch (e) {
    firebaseInitError = e;
    console.error("Erreur Firebase: Config manquante", e);
}


// --- HELPERS CALCULS (fonctions pures, hors du composant) ---
const getLatestSnapshot = (acc) => acc.snapshots?.length ? acc.snapshots[acc.snapshots.length - 1] : null;
const getAccountCurrentValueRaw = (acc) => { const last = getLatestSnapshot(acc); return last ? parseFloat(last.amount) : 0; };
const getAccountCurrentValueInEur = (acc) => { const raw = getAccountCurrentValueRaw(acc); const rate = parseFloat(acc.exchangeRate || 1); return raw * rate; };
const getAccountInvestedTotalRaw = (acc) => {
    return getNetInvestedUntilDate(acc.movements, new Date().toISOString());
};
const getAccountInvestedAmountInEur = (acc) => { const inv = getAccountInvestedTotalRaw(acc); const rate = parseFloat(acc.exchangeRate || 1); return inv * rate; };
const getTotalByBrokerInEur = (b) => b.accounts.reduce((sum, a) => sum + getAccountCurrentValueInEur(a), 0);

// --- APP PRINCIPALE ---

const InvestmentTrackerApp = () => {
  const [user, setUser] = useState(null);
  const [firebaseError] = useState(() => firebaseInitError);
  const [authLoading, setAuthLoading] = useState(() => !auth);
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
  const [sortConfig] = useState({ key: 'value', direction: 'desc' });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const loadUserData = useCallback(async (uid) => {
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
          setNotification({ message: "Erreur chargement données", type: "error" });
          console.error(e);
      }
      setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!auth) return () => {};
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
            await loadUserData(currentUser.uid);
        }
        setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [loadUserData]);

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

  const handleLogin = async () => { try { await signInWithPopup(auth, provider); } catch { showToast("Erreur connexion", "error"); } };
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
  
  const totalPatrimony = useMemo(() => brokers.reduce((sum, b) => sum + b.accounts.reduce((s, a) => s + getAccountCurrentValueInEur(a), 0), 0), [brokers]);
  const totalInvestedGlobal = useMemo(() => brokers.reduce((sum, b) => sum + b.accounts.reduce((s, a) => s + getAccountInvestedAmountInEur(a), 0), 0), [brokers]);
  const totalNetGainLoss = useMemo(() => totalPatrimony - totalInvestedGlobal, [totalPatrimony, totalInvestedGlobal]);

  const globalTRI = useMemo(() => {
    let allMovements = []; let currentTotalValue = 0;
    brokers.forEach(b => {
        b.accounts.forEach(a => {
            const rate = parseFloat(a.exchangeRate || 1);
            currentTotalValue += getAccountCurrentValueRaw(a) * rate;
            if(a.movements) {
                const movesEur = a.movements.map(m => ({ ...m, amount: parseFloat(m.amount) * rate }));
                allMovements = [...allMovements, ...movesEur];
            }
        });
    });
    return calculateXIRR(allMovements, currentTotalValue);
  }, [brokers]);

  // TWR global : chaînage des rendements mensuels, annualisé
  const globalTWR = useMemo(() => {
    const stats = processMonthlyStats(brokers);
    if (!stats.length) return null;
    return annualizeReturn(calculateTWR(stats.map(s => s.yield)), stats.length);
  }, [brokers]);

  const getSortedAccounts = (accounts) => {
    const sortableAccounts = accounts.map(acc => {
        const twrInfo = calculateTWRFromSnapshots(acc.snapshots, acc.movements);
        return {
            ...acc,
            currentValueEur: getAccountCurrentValueInEur(acc),
            investedTotalEur: getAccountInvestedAmountInEur(acc),
            tri: calculateXIRR(acc.movements, getAccountCurrentValueRaw(acc)),
            twr: twrInfo ? twrInfo.annualized : null
        };
    });
    return [...sortableAccounts].sort((a, b) => {
      let aValue, bValue;
      switch (sortConfig.key) {
        case 'name': return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        case 'type': return sortConfig.direction === 'asc' ? a.type.localeCompare(b.type) : b.type.localeCompare(a.type);
        case 'value': aValue = a.currentValueEur; bValue = b.currentValueEur; break;
        case 'performance': {
            const aPerf = a.investedTotalEur > 0 ? (a.currentValueEur - a.investedTotalEur) / a.investedTotalEur : 0;
            const bPerf = b.investedTotalEur > 0 ? (b.currentValueEur - b.investedTotalEur) / b.investedTotalEur : 0;
            aValue = aPerf; bValue = bPerf; break;
        }
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

  if (firebaseError) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-red-200 dark:border-red-800 max-w-md w-full text-center">
        <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6"><AlertCircle className="w-10 h-10 text-red-500 dark:text-red-400" /></div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Configuration Firebase manquante</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-4">Impossible d'initialiser Firebase. Ajoutez les variables suivantes dans l'onglet « Keys/API keys » puis relancez l'application :</p>
        <ul className="text-left text-xs font-mono bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg p-3 mb-4 space-y-1 text-gray-700 dark:text-gray-300">
          <li>VITE_FIREBASE_API_KEY</li>
          <li>VITE_FIREBASE_AUTH_DOMAIN</li>
          <li>VITE_FIREBASE_PROJECT_ID</li>
          <li>VITE_FIREBASE_STORAGE_BUCKET</li>
          <li>VITE_FIREBASE_MESSAGING_SENDER_ID</li>
          <li>VITE_FIREBASE_APP_ID</li>
        </ul>
        <details className="text-left text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg p-3">
          <summary className="font-bold cursor-pointer">Détail de l'erreur</summary>
          <p className="mt-2 break-all">{String(firebaseError.message || firebaseError)}</p>
        </details>
      </div>
    </div>
  );
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><Loader2 className="w-10 h-10 text-blue-600 animate-spin" /></div>;
  if (!user) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4"><div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 max-w-md w-full text-center"><div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6"><Wallet className="w-10 h-10 text-blue-600 dark:text-blue-400" /></div><h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Mon Patrimoine</h1><p className="text-gray-500 dark:text-gray-400 mb-8">Connectez-vous pour synchroniser vos investissements.</p><button onClick={handleLogin} disabled={authLoading} className="w-full bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-white font-bold py-3 px-4 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-3 shadow-sm">Continuer avec Google</button></div></div>;

  
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
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">{dataLoading ? <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-gray-300 animate-spin" /></div> : <>{view === 'dashboard' && <Dashboard brokers={brokers} privacyMode={privacyMode} darkMode={darkMode} totalPatrimony={totalPatrimony} patrimonyGoal={patrimonyGoal} totalInvestedGlobal={totalInvestedGlobal} totalNetGainLoss={totalNetGainLoss} globalTRI={globalTRI} twr={globalTWR} globalCategoryDistribution={globalCategoryDistribution} globalAccountTypeDistribution={globalAccountTypeDistribution} crossDistributionData={crossDistributionData} targetAllocation={targetAllocation} openModal={openModal} />}{view === 'brokers' && <BrokersView brokers={brokers} privacyMode={privacyMode} getTotalByBrokerInEur={getTotalByBrokerInEur} onAdd={() => openModal('broker')} onEdit={(b) => openModal('broker', b)} onDelete={(id) => deleteBroker(id)} onSelect={(b) => { setSelectedBroker(b); setView('accounts'); }} />}{view === 'accounts' && <AccountsView selectedBroker={selectedBroker} privacyMode={privacyMode} getSortedAccounts={getSortedAccounts} getTotalByBrokerInEur={getTotalByBrokerInEur} getAccountInvestedTotalRaw={getAccountInvestedTotalRaw} getAccountCurrentValueRaw={getAccountCurrentValueRaw} onBack={() => { setView('brokers'); setSelectedBroker(null); }} onAddAccount={() => openModal('account')} onEditAccount={(acc) => openModal('account', acc)} onDeleteAccount={(brokerId, accId) => deleteAccount(brokerId, accId)} onSelectAccount={(acc) => { setSelectedAccount(acc); setView('snapshots'); }} />}{view === 'snapshots' && <SnapshotsView selectedBroker={selectedBroker} selectedAccount={selectedAccount} privacyMode={privacyMode} darkMode={darkMode} getAccountCurrentValueRaw={getAccountCurrentValueRaw} getAccountInvestedTotalRaw={getAccountInvestedTotalRaw} getLatestSnapshot={getLatestSnapshot} openModal={openModal} onDeleteSnapshot={(brokerId, accountId, snapId) => deleteSnapshot(brokerId, accountId, snapId)} onBack={() => { setView('accounts'); setSelectedAccount(null); }} />}{view === 'movements' && <MovementsGlobalView brokers={brokers} privacyMode={privacyMode} />}{view === 'simulation' && <SimulationView currentTotal={totalPatrimony} globalTRI={globalTRI} globalTWR={globalTWR} patrimonyGoal={patrimonyGoal} privacyMode={privacyMode} />}{view === 'history' && <HistoryView brokers={brokers} darkMode={darkMode} privacyMode={privacyMode} />}</>}</main>
      
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

export default InvestmentTrackerApp;