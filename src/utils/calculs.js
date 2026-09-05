// --- UTILS & CALCULS ---
// Calculs financiers purs, extraits du composant principal pour être
// réutilisables et testables (voir axe 2 de l'audit).

// Calcul du TRI (XIRR)
export const calculateXIRR = (movements, currentValue) => {
    if (!movements || movements.length === 0 || currentValue === 0) return null;
    const flows = movements.map(m => ({
        amount: m.type === 'withdrawal' ? parseFloat(m.amount) : -parseFloat(m.amount),
        date: new Date(m.date).getTime()
    }));
    flows.push({ amount: parseFloat(currentValue), date: new Date().getTime() });
    flows.sort((a, b) => a.date - b.date);
    if ((flows[flows.length - 1].date - flows[0].date) < 30 * 24 * 3600 * 1000) return null;

    let x0 = 0.1; const tol = 0.00001; const maxIter = 50;
    for (let i = 0; i < maxIter; i++) {
        let fValue = 0; let fDerivative = 0;
        for (const flow of flows) {
            const years = (flow.date - flows[0].date) / (365.25 * 24 * 3600 * 1000);
            const factor = Math.pow(1 + x0, years);
            fValue += flow.amount / factor;
            fDerivative -= (years * flow.amount) / (factor * (1 + x0));
        }
        if (Math.abs(fValue) < tol) return x0 * 100;
        if (Math.abs(fDerivative) < tol) break;
        const newX = x0 - fValue / fDerivative;
        if (isNaN(newX) || Math.abs(newX) > 10) break;
        if (Math.abs(newX - x0) < tol) return newX * 100;
        x0 = newX;
    }
    return null;
};

// Calcul du Ratio de Sharpe (rendement ajusté au risque)
export const calculateSharpeRatio = (monthlyReturns, riskFreeRate = 0.03) => {
    if (!monthlyReturns || monthlyReturns.length < 2) return null;

    const avgReturn = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    const annualizedReturn = avgReturn * 12; // Annualisation

    // Calcul de la volatilité (écart-type)
    const squaredDiffs = monthlyReturns.map(r => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(12); // Annualisation

    if (volatility === 0) return null;

    return (annualizedReturn - riskFreeRate) / volatility;
};

// Calcul des performances par année glissante
export const calculateRollingYearPerformance = (brokers) => {
    const stats = processMonthlyStats(brokers);
    if (stats.length < 12) return [];

    const rollingPerf = [];

    for (let i = 11; i < stats.length; i++) {
        const endMonth = stats[i];
        const startMonth = stats[i - 11]; // 12 mois avant (i-11 car on inclut le mois de départ)

        const startValue = startMonth.value;
        const endValue = endMonth.value;

        // Calcul des flux sur la période
        const flowsInPeriod = stats.slice(i - 11, i + 1).reduce((sum, s) => sum + s.flow, 0);

        // Performance = (Valeur finale - Valeur initiale - Flux) / (Valeur initiale + Flux/2)
        const avgCapital = startValue + (flowsInPeriod / 2);
        const performance = avgCapital > 0 ? ((endValue - startValue - flowsInPeriod) / avgCapital) * 100 : 0;

        rollingPerf.push({
            endDate: endMonth.month,
            displayDate: endMonth.displayDate,
            performance: performance,
            startValue: startValue,
            endValue: endValue,
            flows: flowsInPeriod
        });
    }

    return rollingPerf;
};

// Calcul du TWR (Taux de Rendement Pondéré par le Temps) par chaînage de rendements mensuels
// Neutralise l'effet des flux : performance pure de la gestion
export const calculateTWR = (monthlyYields) => {
    if (!monthlyYields || monthlyYields.length === 0) return null;
    let product = 1;
    for (const y of monthlyYields) {
        const r = 1 + parseFloat(y) / 100;
        if (!isFinite(r) || r <= 0) return null;
        product *= r;
    }
    return (product - 1) * 100;
};

// Annualisation d'un rendement de période
// Ex: rendement 8% sur 6 mois -> équivalent annualisé
export const annualizeReturn = (periodReturnPct, months) => {
    if (periodReturnPct === null || periodReturnPct === undefined || !months || months <= 0) return null;
    const r = 1 + periodReturnPct / 100;
    if (!isFinite(r) || r <= 0) return null;
    return (Math.pow(r, 12 / months) - 1) * 100;
};

// TWR d'un compte : chaîne les rendements entre valorisations successives (Dietz modifié)
export const calculateTWRFromSnapshots = (snapshots, movements) => {
    if (!snapshots || snapshots.length < 2) return null;
    const sorted = [...snapshots].sort((a, b) => new Date(a.date) - new Date(b.date));
    let product = 1;
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const startVal = parseFloat(prev.amount);
        const endVal = parseFloat(curr.amount);
        const startMs = new Date(prev.date).getTime();
        const endMs = new Date(curr.date).getTime();
        const flows = (movements || []).filter(m => {
            const ms = new Date(m.date).getTime();
            return ms > startMs && ms <= endMs;
        }).reduce((sum, m) => {
            if (m.type === 'deposit' || m.type === 'interest') return sum + parseFloat(m.amount);
            if (m.type === 'withdrawal') return sum - parseFloat(m.amount);
            return sum;
        }, 0);
        const base = startVal + flows * 0.5;
        if (!base || Math.abs(base) < 1) return null;
        const r = (endVal - startVal - flows) / base;
        if (r <= -1) return null;
        product *= (1 + r);
    }
    const period = (product - 1) * 100;
    const spanMs = new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime();
    const months = spanMs / ((365.25 / 12) * 24 * 3600 * 1000);
    return { period, annualized: annualizeReturn(period, months) };
};

// Calcul du capital net investi à une date précise
export const getNetInvestedUntilDate = (movements, dateStr) => {
    const targetDate = new Date(dateStr).getTime();
    return (movements || []).reduce((acc, m) => {
        const mDate = new Date(m.date).getTime();
        if (mDate <= targetDate) {
            if (m.type === 'deposit' || m.type === 'interest') return acc + parseFloat(m.amount);
            // Si retrait : on ne soustrait QUE la part de capital
            if (m.type === 'withdrawal') {
                const capitalToRemove = m.capitalPart !== undefined && m.capitalPart !== null
                    ? parseFloat(m.capitalPart)
                    : parseFloat(m.amount);
                return acc - capitalToRemove;
            }
        }
        return acc;
    }, 0);
};

// Format compact des graduations d'axes (ex: 950 -> "950", 12500 -> "12,5k", 1,2M -> "1,2M")
export const formatCompactAxis = (v, suffix = '') => {
    const abs = Math.abs(v);
    let out;
    if (abs >= 1000000) out = (v / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + 'M';
    else if (abs >= 1000) out = (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: abs >= 10000 ? 0 : 1 }) + 'k';
    else out = v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    return out + suffix;
};

// --- HELPER AGRÉGATION MENSUELLE ---
export const processMonthlyStats = (brokers) => {
    let minDateMs = Date.now();
    let hasData = false;

    brokers.forEach(b => b.accounts.forEach(a => {
        if (a.snapshots?.length) {
            hasData = true;
            const dates = a.snapshots.map(s => new Date(s.date).getTime());
            minDateMs = Math.min(minDateMs, ...dates);
        }
        if (a.movements?.length) {
            hasData = true;
            const dates = a.movements.map(m => new Date(m.date).getTime());
            minDateMs = Math.min(minDateMs, ...dates);
        }
    }));

    if (!hasData) return [];

    const startDate = new Date(minDateMs);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setDate(1);

    const stats = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const monthStr = `${year}-${month}`;

        const lastDay = new Date(year, currentDate.getMonth() + 1, 0).getDate();
        const endOfMonthStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

        let totalValue = 0;
        let totalFlows = 0;
        let totalInvested = 0;

        brokers.forEach(broker => {
            broker.accounts.forEach(account => {
                const rate = parseFloat(account.exchangeRate || 1);

                const relevantSnapshots = (account.snapshots || []).filter(s => s.date <= endOfMonthStr);
                const lastSnap = relevantSnapshots.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

                if (lastSnap) {
                    totalValue += parseFloat(lastSnap.amount) * rate;
                }

                const monthMoves = (account.movements || []).filter(m => m.date.startsWith(monthStr));
                monthMoves.forEach(m => {
                    const amount = parseFloat(m.amount) * rate;
                    if (m.type === 'deposit') totalFlows += amount;
                    else if (m.type === 'withdrawal') totalFlows -= amount;
                });

                totalInvested += getNetInvestedUntilDate(account.movements || [], endOfMonthStr) * rate;
            });
        });

        stats.push({
            month: monthStr,
            displayDate: currentDate.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
            value: totalValue,
            flow: totalFlows,
            invested: totalInvested
        });

        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return stats.map((stat, i) => {
        if (i === 0) {
            const performance = stat.value - stat.flow;
            let denominator = stat.flow * 0.5;
            if (denominator === 0) denominator = stat.value;

            return {
                ...stat,
                variation: stat.value,
                performance: performance,
                yield: (denominator > 0) ? (performance / denominator) * 100 : 0
            };
        }

        const prev = stats[i - 1];
        const variation = stat.value - prev.value;
        const performance = variation - stat.flow;

        let denominator = prev.value + (stat.flow * 0.5);

        if (Math.abs(denominator) < 1) denominator = stat.flow * 0.5;
        if (denominator === 0) denominator = 1;

        const yieldPct = (performance / denominator) * 100;

        return { ...stat, variation, performance, yield: yieldPct };
    });
};
