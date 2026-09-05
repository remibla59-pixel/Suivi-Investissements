// --- UTILS MARCHÉS ---
// Récupération des clôtures mensuelles d'indices pour la comparaison benchmark.
// Source : Twelve Data (https://twelvedata.com) — clé gratuite via VITE_TWELVEDATA_API_KEY.
// CORS supporté côté navigateur (access-control-allow-origin: *), quota gratuit : 800 crédits/jour.
// 1 requête par indice et par jour suffit grâce au cache localStorage (24h).

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 jour

// Les ETF US ci-dessous (tous disponibles sur le plan gratuit de Twelve Data) sont
// libellés en USD. Ils sont convertis en euros via le taux EUR/USD mensuel (même clé,
// même API) pour rester cohérents avec un portefeuille valorisé en euros.
// (Les indices type SPX/CAC nécessitent un plan payant chez Twelve Data.)
export const BENCHMARK_OPTIONS = [
    { symbol: 'SPY', label: 'S&P 500 (ETF SPY)', currency: 'USD' },
    { symbol: 'EWQ', label: 'CAC 40 (ETF EWQ)', currency: 'USD' },
    { symbol: 'EZU', label: 'Euro Stoxx 50 (ETF EZU)', currency: 'USD' },
    { symbol: 'QQQ', label: 'Nasdaq 100 (ETF QQQ)', currency: 'USD' },
    { symbol: 'EWG', label: 'DAX (ETF EWG)', currency: 'USD' },
    { symbol: 'URTH', label: 'MSCI World (ETF URTH)', currency: 'USD' },
];

export const getBenchmarkApiKey = () => import.meta.env.VITE_TWELVEDATA_API_KEY || '';

const readCache = (cacheKey) => {
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { fetchedAt, values } = JSON.parse(cached);
            if (Date.now() - fetchedAt < CACHE_TTL_MS && Array.isArray(values) && values.length) return values;
        }
    } catch { /* cache illisible : on ignore */ }
    return null;
};

const writeCache = (cacheKey, values) => {
    try {
        localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), values }));
    } catch { /* stockage indisponible : on ignore */ }
};

const fetchMonthlySeries = async (symbol, apiKey) => {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1month&outputsize=120&apikey=${apiKey}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json.status === 'error' || !Array.isArray(json.values)) {
        throw new Error((json.message && json.message.replace(/\*\*/g, '')) || 'Erreur de chargement des données');
    }

    const values = json.values
        .map(v => ({ date: v.datetime, close: parseFloat(v.close) }))
        .filter(v => !isNaN(v.close) && v.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

    if (!values.length) throw new Error('Aucune donnée disponible pour ce symbole');
    return values;
};

// Taux EUR/USD mensuels (combien d'euros vaut 1 dollar, par mois)
const fetchEurUsdMonthly = async (apiKey) => {
    const cacheKey = 'benchmark_cache_EURUSD';
    const cached = readCache(cacheKey);
    if (cached) return cached;
    const values = await fetchMonthlySeries('EUR/USD', apiKey);
    writeCache(cacheKey, values);
    return values;
};

// Retourne la série mensuelle [{ date: 'YYYY-MM-DD', close }] triée par date croissante,
// avec les indices en USD convertis en euros (close EUR = close USD ÷ taux EUR/USD).
export const fetchBenchmarkMonthly = async (symbol, apiKey) => {
    if (!apiKey) throw new Error('NO_API_KEY');

    const cacheKey = `benchmark_cache_${symbol}`;
    const cached = readCache(cacheKey);
    if (cached) return cached;

    const option = BENCHMARK_OPTIONS.find(o => o.symbol === symbol);
    let values = await fetchMonthlySeries(symbol, apiKey);

    if (option && option.currency === 'USD') {
        const fx = await fetchEurUsdMonthly(apiKey);
        const rateByMonth = new Map(fx.map(p => [p.date.slice(0, 7), p.close]));
        let lastRate = null;
        values = values.map(v => {
            const rate = rateByMonth.get(v.date.slice(0, 7)) ?? lastRate;
            if (rate && rate > 0) lastRate = rate;
            return { ...v, close: lastRate ? v.close / lastRate : v.close };
        });
        if (!lastRate) throw new Error('Taux EUR/USD indisponible pour la conversion en euros');
    }

    writeCache(cacheKey, values);
    return values;
};