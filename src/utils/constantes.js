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
