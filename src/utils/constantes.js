// --- CONSTANTES ---
// Constantes métier partagées par l'ensemble des vues (axe 2 de l'audit).
import { TrendingUp, DollarSign, TrendingDown, BarChart3, Gem, Home, Wallet, PieChart as PieChartIcon } from 'lucide-react';

// Palette « journal de bord » : teintes sourdes, lisibles sur papier ivoire.
export const INVESTMENT_CATEGORIES = [
  { value: 'actions', label: 'Actions / ETF', color: '#14603B', icon: TrendingUp },
  { value: 'fondsEuros', label: 'Fonds Euros', color: '#1F4E79', icon: DollarSign },
  { value: 'obligations', label: 'Obligations', color: '#9A6B2F', icon: TrendingDown },
  { value: 'crypto', label: 'Crypto', color: '#6B4E8F', icon: BarChart3 },
  { value: 'or', label: 'Or / Métaux', color: '#C9A227', icon: Gem },
  { value: 'immobilier', label: 'Immobilier (SCPI)', color: '#A4493C', icon: Home },
  { value: 'liquidites', label: 'Liquidités', color: '#6E7685', icon: Wallet },
  { value: 'dette', label: 'Dette / Levier', color: '#8C2F39', icon: TrendingDown },
  { value: 'autre', label: 'Autre', color: '#9AA0A6', icon: PieChartIcon }
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
  { value: 'PEA', label: 'PEA', color: '#1F4E79' },
  { value: 'CTO', label: 'Compte Titres', color: '#14603B' },
  { value: 'AV', label: 'Assurance Vie', color: '#9A6B2F' },
  { value: 'PER', label: 'PER', color: '#6B4E8F' },
  { value: 'PEE', label: 'PEE', color: '#A4493C' },
  { value: 'Crypto', label: 'Crypto', color: '#8C2F39' },
  { value: 'Livret', label: 'Livret', color: '#2F6F6B' },
  { value: 'Autre', label: 'Autre', color: '#6E7685' }
];

export const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dollar US' },
  { code: 'GBP', symbol: '£', label: 'Livre Sterling' },
  { code: 'CHF', symbol: 'CHF', label: 'Franc Suisse' },
  { code: 'BTC', symbol: '₿', label: 'Bitcoin' },
];
