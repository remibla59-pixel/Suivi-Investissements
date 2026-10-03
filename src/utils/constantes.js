// --- CONSTANTES ---
// Constantes métier partagées par l'ensemble des vues (axe 2 de l'audit).
import { TrendingUp, DollarSign, TrendingDown, BarChart3, Gem, Home, Wallet, PieChart as PieChartIcon } from 'lucide-react';

export const INVESTMENT_CATEGORIES = [
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

// Sous-catégories optionnelles proposées sous chaque classe d'actifs (ex. Actions
// → ETF, Small Caps). Elles affinent la saisie et la lecture, mais tous les agrégats
// et graphiques restent calculés au niveau de la classe d'actifs : une valorisation
// saisie sans sous-catégorie reste parfaitement valide (données existantes incluses).
export const INVESTMENT_SUBCATEGORIES = {
  actions: [
    { value: 'etf', label: 'ETF' },
    { value: 'smallCaps', label: 'Small Caps' },
    { value: 'actionsDirectes', label: 'Actions en direct' },
    { value: 'fondsThematiques', label: 'Fonds thématiques' }
  ],
  obligations: [
    { value: 'etf', label: 'ETF obligataires' },
    { value: 'fonds', label: 'Fonds obligataires' },
    { value: 'fondsDated', label: 'Fonds datés' },
    { value: 'obligationsDirectes', label: 'Obligations en direct' }
  ],
  crypto: [
    { value: 'btc', label: 'Bitcoin' },
    { value: 'eth', label: 'Ethereum' },
    { value: 'altcoins', label: 'Altcoins' }
  ],
  or: [
    { value: 'physique', label: 'Or physique' },
    { value: 'etf', label: 'ETF / Trackers' }
  ],
  immobilier: [
    { value: 'scpi', label: 'SCPI' },
    { value: 'immobilierDirect', label: 'Immobilier direct' }
  ]
};

// Libellé lisible d'une sous-catégorie (retombe sur la valeur brute si inconnue).
export const getSubcategoryLabel = (type, sub) =>
  INVESTMENT_SUBCATEGORIES[type]?.find(s => s.value === sub)?.label || sub;

export const ACCOUNT_TYPES = [
  { value: 'PEA', label: 'PEA', color: '#3B82F6' },
  { value: 'CTO', label: 'Compte Titres', color: '#10B981' },
  { value: 'AV', label: 'Assurance Vie', color: '#F59E0B' },
  { value: 'PER', label: 'PER', color: '#8B5CF6' },
  { value: 'PEE', label: 'PEE', color: '#EC4899' },
  { value: 'Crypto', label: 'Crypto', color: '#EF4444' },
  { value: 'Livret', label: 'Livret', color: '#14B8A6' },
  { value: 'Autre', label: 'Autre', color: '#6B7280' }
];

export const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dollar US' },
  { code: 'GBP', symbol: '£', label: 'Livre Sterling' },
  { code: 'CHF', symbol: 'CHF', label: 'Franc Suisse' },
  { code: 'BTC', symbol: '₿', label: 'Bitcoin' },
];
