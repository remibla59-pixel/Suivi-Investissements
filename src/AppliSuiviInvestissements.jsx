import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PlusCircle, Trash2, Edit2, Building2, Wallet, TrendingUp, PieChart as PieChartIcon, BarChart3, ChevronRight, ArrowLeft, X, AlertCircle, DollarSign, Home, Gem, TrendingDown, Download, Upload, Coins, Target, ArrowDownCircle, ArrowUpCircle, History, LogOut, Loader2, Save, Moon, Sun, CheckCircle, ArrowRightLeft, Percent, HelpCircle, Activity, RotateCcw, Calculator, Calendar, GitCompare, Flag, Eye, EyeOff } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, PieChart, Pie, Cell } from 'recharts';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// --- CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAKCcte2Jd6Ckw2FJTIQy5uqskpE35YtvA",
  authDomain: "suivi-investissements-9e9ea.firebaseapp.com",
  projectId: "suivi-investissements-9e9ea",
  storageBucket: "suivi-investissements-9e9ea.firebasestorage.app",
  messagingSenderId: "124675947188",
  appId: "1:124675947188:web:25294b7d1c3620100a35e1"
};

let auth, db, provider;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  provider = new GoogleAuthProvider();
} catch (e) {
  console.error("Erreur d'initialisation Firebase:", e);
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
  { value: 'dette', label: 'Dette / Levier', color: '#E11D48', icon: ArrowDownCircle },
  { value: 'autre', label: 'Autre', color: '#9CA3AF', icon: PieChartIcon }
];

const ACCOUNT_TYPES = [
  { value: 'PEA', label: 'PEA', color: '#3B82F6' },
  { value: 'CTO', label: 'Compte Titres', color: '#10B981' },
  { value: 'AV', label: 'Assurance Vie', color: '#F59E0B' },
  { value: 'PER', label: 'PER', color: '#8B5CF6' },
  { value: 'Livret', label: 'Livret', color: '#14B8A6' },
  { value: 'Emprunt', label: 'Emprunt / Dette', color: '#E11D48' },
  { value: 'Autre', label: 'Autre', color: '#6B7280' }
];

const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dollar US' }
];

// --- COMPOSANTS UI ---

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    info: "bg-blue-500"
  };

  return (
    <div className={`fixed bottom-4 right-4 ${styles[type]} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-up z-50`}>
      {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      <span className="font-medium">{message}</span>
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-modal-in">
        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const BlurMoney = ({ amount, currency = '€', privacyMode, className = "" }) => {
  if (privacyMode) {
    return <span className={`bg-gray-200 dark:bg-slate-700 text-transparent rounded px-1 select-none ${className}`}>000,000.00</span>;
  }
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  return <span className={className}>{formatted} {currency}</span>;
};

const PerformanceBadge = ({ current, invested, category }) => {
  // On n'affiche pas de performance pour la dette car elle est négative par nature
  if (category === 'dette') return null;
  if (!invested || parseFloat(invested) === 0) return null;
  
  const perf = ((parseFloat(current) - parseFloat(invested)) / Math.abs(parseFloat(invested))) * 100;
  const isPositive = perf >= 0;
  
  return (
    <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${isPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
      {isPositive ? '+' : ''}{perf.toFixed(2)}%
    </div>
  );
};

// --- LOGIQUE DE CALCUL ---

const processMonthlyStats = (brokers) => {
  const statsByMonth = {};
  
  brokers.forEach(broker => {
    broker.accounts.forEach(account => {
      account.snapshots?.forEach(snap => {
        const month = snap.date.substring(0, 7);
        if (!statsByMonth[month]) statsByMonth[month] = { date: month, total: 0, invested: 0 };
        const val = parseFloat(snap.amount) * (parseFloat(account.exchangeRate) || 1);
        statsByMonth[month].total += val;
        // Pour le levier, on considère que l'investi sur une dette est le montant initial (souvent négatif aussi)
        statsByMonth[month].invested += (parseFloat(account.investedAmount) || 0) * (parseFloat(account.exchangeRate) || 1);
      });
    });
  });

  return Object.values(statsByMonth).sort((a, b) => a.date.localeCompare(b.date));
};

// --- COMPOSANTS DE VUE ---

const AllocationCibleModal = ({ isOpen, onCancel, onSubmit, currentAllocation, brokers }) => {
  const [targets, setTargets] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setTargets(INVESTMENT_CATEGORIES.map(cat => ({
        ...cat,
        percent: currentAllocation[cat.value] || 0
      })));
    }
  }, [isOpen, currentAllocation]);

  const total = targets.reduce((sum, t) => sum + (parseFloat(t.percent) || 0), 0);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Objectifs d'Allocation">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 mb-4">Définissez votre répartition idéale. La somme doit idéalement faire 100% (incluant la dette négative).</p>
        <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
          {targets.map((target, idx) => (
            <div key={target.value} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${target.color}20`, color: target.color }}>
                <target.icon className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">{target.label}</span>
              <div className="relative w-24">
                <input
                  type="number"
                  step="any"
                  className="w-full border dark:border-slate-700 dark:bg-slate-900 p-2 pr-8 rounded-lg text-right"
                  value={target.percent}
                  onChange={(e) => {
                    const newTargets = [...targets];
                    newTargets[idx].percent = e.target.value;
                    setTargets(newTargets);
                  }}
                />
                <span className="absolute right-3 top-2 text-gray-400">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className={`p-4 rounded-xl flex justify-between items-center ${Math.abs(total - 100) < 0.1 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <span className="font-bold">Total :</span>
          <span className="font-bold text-lg">{total.toFixed(1)} %</span>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onCancel} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Annuler</button>
          <button onClick={() => {
            const mapping = {};
            targets.forEach(t => { if (t.percent !== 0) mapping[t.value] = parseFloat(t.percent); });
            onSubmit(mapping);
          }} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-lg">Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
};

// --- APPLICATION PRINCIPALE ---

export default function AppliSuivi() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [brokers, setBrokers] = useState([]);
  const [targetAllocation, setTargetAllocation] = useState({});
  const [privacyMode, setPrivacyMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Modals States
  const [isBrokerModalOpen, setBrokerModalOpen] = useState(false);
  const [isAccountModalOpen, setAccountModalOpen] = useState(false);
  const [isValuationModalOpen, setValuationModalOpen] = useState(false);
  const [isTargetModalOpen, setTargetModalOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState(null);
  const [selectedBrokerForAccount, setSelectedBrokerForAccount] = useState(null);
  const [selectedAccountForValuation, setSelectedAccountForValuation] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) loadUserData(u.uid);
      else setLoading(false);
    });
    return unsub;
  }, []);

  const loadUserData = async (uid) => {
    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBrokers(data.brokers || []);
        setTargetAllocation(data.targetAllocation || {});
      }
    } catch (e) {
      showToast("Erreur lors du chargement des données", "error");
    } finally {
      setLoading(false);
    }
  };

  const saveData = async (newBrokers, newTargets) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        brokers: newBrokers || brokers,
        targetAllocation: newTargets || targetAllocation,
        lastUpdate: new Date().toISOString()
      });
    } catch (e) {
      showToast("Erreur de sauvegarde", "error");
    }
  };

  const showToast = (message, type = 'success') => setToast({ message, type });

  // --- ACTIONS ---

  const handleAddBroker = (name) => {
    const newBrokers = [...brokers, { id: Date.now().toString(), name, accounts: [] }];
    setBrokers(newBrokers);
    saveData(newBrokers);
    showToast("Établissement ajouté");
  };

  const handleAddAccount = (brokerId, accountData) => {
    const newBrokers = brokers.map(b => {
      if (b.id === brokerId) {
        return {
          ...b,
          accounts: [...b.accounts, {
            id: Date.now().toString(),
            ...accountData,
            snapshots: [{ date: new Date().toISOString().split('T')[0], amount: accountData.initialAmount }]
          }]
        };
      }
      return b;
    });
    setBrokers(newBrokers);
    saveData(newBrokers);
    showToast("Compte ajouté avec succès");
  };

  const handleAddValuation = (brokerId, accountId, amount, date) => {
    const newBrokers = brokers.map(b => {
      if (b.id === brokerId) {
        return {
          ...b,
          accounts: b.accounts.map(a => {
            if (a.id === accountId) {
              const snaps = [...(a.snapshots || []), { date, amount: parseFloat(amount) }]
                .sort((x, y) => new Date(x.date) - new Date(y.date));
              return { ...a, snapshots: snaps };
            }
            return a;
          })
        };
      }
      return b;
    });
    setBrokers(newBrokers);
    saveData(newBrokers);
    showToast("Valorisation mise à jour");
  };

  // --- CALCULS ---

  const stats = useMemo(() => {
    let totalValue = 0;
    let totalInvested = 0;
    const catTotals = {};

    brokers.forEach(b => {
      b.accounts.forEach(a => {
        const lastSnap = a.snapshots?.[a.snapshots.length - 1];
        const currentVal = (lastSnap ? parseFloat(lastSnap.amount) : 0) * (parseFloat(a.exchangeRate) || 1);
        const investedVal = (parseFloat(a.investedAmount) || 0) * (parseFloat(a.exchangeRate) || 1);
        
        totalValue += currentVal;
        totalInvested += investedVal;
        catTotals[a.category] = (catTotals[a.category] || 0) + currentVal;
      });
    });

    const allocation = INVESTMENT_CATEGORIES.map(cat => ({
      ...cat,
      current: catTotals[cat.value] || 0,
      percent: totalValue !== 0 ? ((catTotals[cat.value] || 0) / totalValue) * 100 : 0,
      target: targetAllocation[cat.value] || 0
    })).filter(c => Math.abs(c.current) > 0 || c.target > 0);

    return { totalValue, totalInvested, allocation, history: processMonthlyStats(brokers) };
  }, [brokers, targetAllocation]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <TrendingUp className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2">WealthTrace</h1>
        <p className="text-gray-500 mb-8 font-medium">Suivez votre patrimoine net et votre levier en temps réel.</p>
        <button 
          onClick={() => signInWithPopup(auth, provider)}
          className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-lg active:scale-95"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Continuer avec Google
        </button>
      </div>
    </div>
  );

  return (
    <div className={`${darkMode ? 'dark' : ''} min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300`}>
      {/* HEADER */}
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Activity className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-black tracking-tight hidden sm:block">WEALTHTRACE</span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setPrivacyMode(!privacyMode)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all">
              {privacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={() => signOut(auth)} className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all ml-2">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* NAVIGATION ONGLETS */}
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1.5 rounded-2xl w-fit mb-8 shadow-inner">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('allocation')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'allocation' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
          >
            Allocation
          </button>
          <button 
            onClick={() => setActiveTab('assets')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'assets' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
          >
            Mes Actifs
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* RÉSUMÉ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <Wallet className="w-16 h-16" />
                </div>
                <p className="text-slate-500 font-bold text-sm mb-2 uppercase tracking-wider">Patrimoine Net</p>
                <div className="flex items-baseline gap-2">
                  <BlurMoney amount={stats.totalValue} className="text-4xl font-black" privacyMode={privacyMode} />
                </div>
                <div className="mt-4">
                   <PerformanceBadge current={stats.totalValue} invested={stats.totalInvested} />
                </div>
              </div>

              <div className="md:col-span-2 bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
                <h3 className="font-black text-lg mb-6 flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-500" /> 
                  Évolution du Patrimoine
                </h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.history}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#f1f5f9'} />
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: darkMode ? '#1e293b' : '#fff' }}
                        formatter={(val) => [`${val.toLocaleString()} €`, 'Total']}
                      />
                      <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* QUICK ACTIONS */}
            <div className="flex flex-wrap gap-4">
              <button onClick={() => setBrokerModalOpen(true)} className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                <PlusCircle className="w-5 h-5" /> Ajouter un Établissement
              </button>
            </div>
          </div>
        )}

        {activeTab === 'allocation' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black">Allocation Stratégique</h2>
              <button 
                onClick={() => setTargetModalOpen(true)}
                className="bg-white dark:bg-slate-800 px-5 py-2.5 rounded-xl font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-all"
              >
                <Target className="w-4 h-4 text-blue-500" /> Définir Cibles
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* LISTE ALLOCATION */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="space-y-6">
                  {stats.allocation.map(item => (
                    <div key={item.value}>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.color}20`, color: item.color }}>
                            <item.icon className="w-4 h-4" />
                          </div>
                          <span className="font-bold">{item.label}</span>
                        </div>
                        <div className="text-right">
                          <BlurMoney amount={item.current} className="font-black block" privacyMode={privacyMode} />
                          <span className="text-xs text-slate-500 font-bold">{item.percent.toFixed(1)}% {item.target > 0 && `/ Cible ${item.target}%`}</span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                        <div 
                          className="h-full transition-all duration-1000" 
                          style={{ width: `${Math.min(100, Math.abs(item.percent))}%`, backgroundColor: item.color }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* GRAPHIQUE PIE */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center">
                <div className="h-[350px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.allocation.map(d => ({ ...d, value: Math.abs(d.current) }))}
                        innerRadius={80}
                        outerRadius={120}
                        paddingAngle={8}
                        dataKey="value"
                        stroke="none"
                      >
                        {stats.allocation.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: darkMode ? '#1e293b' : '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-slate-500 font-bold uppercase text-xs tracking-widest">Net</span>
                    <BlurMoney amount={stats.totalValue} className="text-2xl font-black" privacyMode={privacyMode} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {brokers.map(broker => (
              <div key={broker.id} className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="p-6 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white dark:bg-slate-700 rounded-xl shadow-sm flex items-center justify-center font-black text-blue-600">
                      {broker.name.charAt(0)}
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight">{broker.name}</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setSelectedBrokerForAccount(broker.id); setAccountModalOpen(true); }}
                      className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-xl transition-all"
                    >
                      <PlusCircle className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={() => {
                        if(confirm("Supprimer cet établissement ?")) {
                          const nb = brokers.filter(b => b.id !== broker.id);
                          setBrokers(nb); saveData(nb);
                        }
                      }}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-xl transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-50 dark:divide-slate-700">
                  {broker.accounts.length === 0 && (
                    <div className="p-12 text-center text-slate-400 font-medium italic">Aucun compte ajouté</div>
                  )}
                  {broker.accounts.map(account => {
                    const lastSnap = account.snapshots?.[account.snapshots.length - 1];
                    const currentVal = (lastSnap ? parseFloat(lastSnap.amount) : 0);
                    const categoryData = INVESTMENT_CATEGORIES.find(c => c.value === account.category);

                    return (
                      <div key={account.id} className="p-6 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-all group">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-[200px]">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${categoryData?.color}15`, color: categoryData?.color }}>
                              {categoryData ? <categoryData.icon className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                            </div>
                            <div>
                              <div className="font-black text-lg group-hover:text-blue-600 transition-colors">{account.name}</div>
                              <div className="flex gap-2 items-center">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{account.type}</span>
                                {account.currency !== 'EUR' && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500">Taux: {account.exchangeRate}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex-1 flex justify-end items-center gap-8">
                            <div className="text-right">
                              <BlurMoney amount={currentVal * (account.exchangeRate || 1)} className="text-xl font-black" privacyMode={privacyMode} />
                              <div className="flex justify-end mt-1">
                                <PerformanceBadge current={currentVal} invested={account.investedAmount} category={account.category} />
                              </div>
                            </div>
                            
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button 
                                onClick={() => { setSelectedAccountForValuation({ brokerId: broker.id, accountId: account.id, name: account.name }); setValuationModalOpen(true); }}
                                className="p-2.5 bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 rounded-xl hover:border-blue-500 hover:text-blue-500 transition-all"
                              >
                                <TrendingUp className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODALS */}
      
      {/* Modal Etablissement */}
      <Modal isOpen={isBrokerModalOpen} onClose={() => setBrokerModalOpen(false)} title="Nouvel Établissement">
        <form onSubmit={(e) => {
          e.preventDefault();
          const name = e.target.brokerName.value;
          if(name) { handleAddBroker(name); setBrokerModalOpen(false); }
        }} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase mb-2">Nom de la banque ou plateforme</label>
            <input name="brokerName" autoFocus className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-4 rounded-2xl focus:border-blue-500 outline-none transition-all font-bold" placeholder="Ex: Boursorama, Binance, SCI..." />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20">CRÉER</button>
        </form>
      </Modal>

      {/* Modal Compte */}
      <Modal isOpen={isAccountModalOpen} onClose={() => setAccountModalOpen(false)} title="Nouveau Compte">
        <form onSubmit={(e) => {
          e.preventDefault();
          const data = {
            name: e.target.accName.value,
            type: e.target.accType.value,
            category: e.target.accCat.value,
            currency: e.target.accCur.value,
            exchangeRate: e.target.accRate.value || 1,
            investedAmount: parseFloat(e.target.accInvested.value) || 0,
            initialAmount: parseFloat(e.target.accVal.value) || 0
          };
          handleAddAccount(selectedBrokerForAccount, data);
          setAccountModalOpen(false);
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-black text-slate-400 mb-1 tracking-widest uppercase">Nom du compte</label>
              <input name="accName" required className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl outline-none focus:border-blue-500 font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 uppercase">Type</label>
              <select name="accType" className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl outline-none focus:border-blue-500 font-bold">
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 uppercase">Catégorie</label>
              <select name="accCat" className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl outline-none focus:border-blue-500 font-bold">
                {INVESTMENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 uppercase">Montant Investi (ou Emprunté)</label>
              <input name="accInvested" type="number" step="any" required className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 uppercase">Valeur Actuelle</label>
              <input name="accVal" type="number" step="any" required className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 uppercase">Devise</label>
              <select name="accCur" className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold">
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 uppercase">Taux de change (vs EUR)</label>
              <input name="accRate" type="number" step="any" defaultValue="1" className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold" />
            </div>
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black mt-4">AJOUTER</button>
        </form>
      </Modal>

      {/* Modal Valorisation */}
      <Modal isOpen={isValuationModalOpen} onClose={() => setValuationModalOpen(false)} title={`Mise à jour : ${selectedAccountForValuation?.name}`}>
        <form onSubmit={(e) => {
          e.preventDefault();
          handleAddValuation(selectedAccountForValuation.brokerId, selectedAccountForValuation.accountId, e.target.valAmount.value, e.target.valDate.value);
          setValuationModalOpen(false);
        }} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1 uppercase tracking-widest">Nouvelle Valeur (Négatif si Dette)</label>
            <input name="valAmount" type="number" step="any" required autoFocus className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-4 rounded-2xl font-black text-xl" />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1 uppercase tracking-widest">Date du relevé</label>
            <input name="valDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 p-4 rounded-2xl font-bold" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black">VALIDER</button>
        </form>
      </Modal>

      <AllocationCibleModal 
        isOpen={isTargetModalOpen} 
        currentAllocation={targetAllocation}
        onCancel={() => setTargetModalOpen(false)}
        onSubmit={(newTargets) => {
          setTargetAllocation(newTargets);
          saveData(null, newTargets);
          setTargetModalOpen(false);
          showToast("Cibles mises à jour");
        }}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}