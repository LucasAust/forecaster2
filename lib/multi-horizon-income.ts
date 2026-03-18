/**
 * Multi-Horizon Income Model
 * 
 * Instead of predicting income as a flat monthly number, this model
 * combines signals at multiple time scales:
 * 
 *   Weekly:    What's the typical weekly income? (smooths out daily noise)
 *   Biweekly:  Are there biweekly patterns? (common for gig payouts)
 *   Monthly:   Calendar-month seasonality (March is always high, etc.)
 *   Quarterly: Quarterly business cycles (most stable signal)
 *   Yearly:    Year-over-year growth/decline trend
 * 
 * The model produces a per-month income target for each forecast month,
 * which the main forecast engine uses for calibration.
 */

import type { Transaction } from "@/types";

interface IncomeSignal {
    horizon: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
    target: number;      // Predicted monthly income from this signal
    confidence: number;  // 0-1, based on data availability and consistency
    cv: number;          // Coefficient of variation (lower = more predictable)
}

export interface MultiHorizonIncomeTarget {
    month: string;       // YYYY-MM
    target: number;      // Blended predicted income for this month
    signals: IncomeSignal[];
    confidence: "high" | "medium" | "low";
}

// ─── Helpers ────────────────────────────────────────────────

function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr: number[]): number {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function cv(arr: number[]): number {
    if (arr.length < 2) return 1;
    const m = mean(arr);
    if (m === 0) return 1;
    const std = Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
    return std / m;
}

// Patterns for lumpy income (check deposits, large Venmo) that the main
// forecast engine filters as noise but we want to count for target-setting
const LUMPY_INCOME_PATTERNS = [
    /remote\s*online\s*deposit/i,
    /check\s*deposit/i,
    /deposit\s+id\s+number/i,
];

// Noise patterns — internal transfers, not real income
const INTERNAL_TRANSFER_PATTERNS = [
    /transfer\s*from\s*(chk|sav|checking|savings)/i,
    /online\s*(realtime\s*)?transfer\s*(from|to)/i,
    /remote\s*online\s*deposit/i,
    /moneylink/i,
    /^(schwab|fidelity|vanguard|etrade)\b/i,
    /acct\s*(xfer|transfer)/i,
    /payment.*chase.*card/i,
    /payment.*thank/i,
    /autopay/i,
    /loan\s*payment/i,
    /interest\s*(charge|payment)/i,
];

function isInternalTransfer(tx: Transaction): boolean {
    const cat = Array.isArray(tx.category) ? tx.category[0] : tx.category;
    if (cat === "Transfer") return true;
    const name = tx.merchant_name || tx.name || "";
    return INTERNAL_TRANSFER_PATTERNS.some(p => p.test(name));
}

// ─── Extract real income transactions ───────────────────────

function extractRealIncome(transactions: Transaction[]): { date: string; amount: number }[] {
    return transactions
        .filter(tx => {
            if (tx.pending) return false;
            // Plaid: negative amount = income (credit)
            if (tx.amount >= 0) return false;
            if (isInternalTransfer(tx)) return false;
            return true;
        })
        .map(tx => ({ date: tx.date, amount: Math.abs(tx.amount) }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Signal Generators ──────────────────────────────────────

function weeklySignal(income: { date: string; amount: number }[], forecastMonth: number): IncomeSignal {
    // Compute weekly income totals
    const byWeek = new Map<string, number>();
    for (const tx of income) {
        const d = new Date(tx.date + "T12:00:00");
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().substring(0, 10);
        byWeek.set(key, (byWeek.get(key) || 0) + tx.amount);
    }

    const weeklyAmounts = [...byWeek.values()];
    if (weeklyAmounts.length < 4) {
        return { horizon: "weekly", target: 0, confidence: 0, cv: 1 };
    }

    // Use median weekly income × ~4.33 weeks/month
    const medianWeekly = median(weeklyAmounts);
    const weeksPerMonth = 4.33;
    const monthlyFromWeekly = medianWeekly * weeksPerMonth;
    const weeklyCV = cv(weeklyAmounts);

    // Weekly data is always available and provides a solid baseline,
    // even if CV is high. Give it moderate confidence based on data volume.
    return {
        horizon: "weekly",
        target: monthlyFromWeekly,
        confidence: Math.min(0.7, weeklyAmounts.length / 20),
        cv: weeklyCV,
    };
}

function monthlySeasonalSignal(
    income: { date: string; amount: number }[],
    forecastMonth: number // 1-12
): IncomeSignal {
    // Group by calendar month
    const byCalMonth = new Map<number, number[]>();
    const byYearMonth = new Map<string, number>();

    for (const tx of income) {
        const ym = tx.date.substring(0, 7);
        byYearMonth.set(ym, (byYearMonth.get(ym) || 0) + tx.amount);
    }

    for (const [ym, total] of byYearMonth) {
        const m = parseInt(ym.split("-")[1], 10);
        if (!byCalMonth.has(m)) byCalMonth.set(m, []);
        byCalMonth.get(m)!.push(total);
    }

    const sameMonthData = byCalMonth.get(forecastMonth) || [];
    if (sameMonthData.length === 0) {
        // No data for this calendar month — use overall median
        const allMonthly = [...byYearMonth.values()];
        return {
            horizon: "monthly",
            target: median(allMonthly),
            confidence: 0.3,
            cv: cv(allMonthly),
        };
    }

    return {
        horizon: "monthly",
        target: mean(sameMonthData), // Mean of same-month across years
        confidence: Math.min(1, sameMonthData.length / 3), // More years = more confidence
        cv: cv(sameMonthData),
    };
}

function quarterlySignal(
    income: { date: string; amount: number }[],
    forecastQuarter: number // 1-4
): IncomeSignal {
    const byQuarter = new Map<string, number>();
    const byYearMonth = new Map<string, number>();

    for (const tx of income) {
        const ym = tx.date.substring(0, 7);
        byYearMonth.set(ym, (byYearMonth.get(ym) || 0) + tx.amount);
    }

    for (const [ym, total] of byYearMonth) {
        const m = parseInt(ym.split("-")[1], 10);
        const y = ym.split("-")[0];
        const q = Math.ceil(m / 3);
        const key = `${y}-Q${q}`;
        byQuarter.set(key, (byQuarter.get(key) || 0) + total);
    }

    // Same quarter across years → monthly rate
    const sameQ = [...byQuarter.entries()]
        .filter(([k]) => k.endsWith(`Q${forecastQuarter}`))
        .map(([, v]) => v / 3); // Convert quarterly total to monthly rate

    if (sameQ.length === 0) {
        const allQ = [...byQuarter.values()].map(v => v / 3);
        return { horizon: "quarterly", target: median(allQ), confidence: 0.3, cv: cv(allQ) };
    }

    return {
        horizon: "quarterly",
        target: mean(sameQ),
        confidence: Math.min(1, sameQ.length / 2),
        cv: cv(sameQ),
    };
}

function recentMomentumSignal(
    income: { date: string; amount: number }[],
    referenceDate: Date
): IncomeSignal {
    // What's the income trend in the last 2-3 months?
    const refMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;

    const byMonth = new Map<string, number>();
    for (const tx of income) {
        const m = tx.date.substring(0, 7);
        byMonth.set(m, (byMonth.get(m) || 0) + tx.amount);
    }

    // Get last 3 full months before reference
    const months = [...byMonth.entries()]
        .filter(([m]) => m < refMonth)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-3);

    if (months.length === 0) {
        return { horizon: "monthly", target: 0, confidence: 0, cv: 1 };
    }

    // Use the LOWER of: weighted recent average vs minimum recent month.
    // This captures the realistic downside — income can drop suddenly,
    // and predicting the minimum is safer than predicting the average.
    const weights = [1, 2, 3].slice(-months.length);
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < months.length; i++) {
        weightedSum += months[i][1] * weights[i];
        totalWeight += weights[i];
    }
    const weightedAvg = weightedSum / totalWeight;
    const minRecent = Math.min(...months.map(([, v]) => v));
    // Blend: 60% weighted average, 40% minimum (conservative lean)
    const target = weightedAvg * 0.6 + minRecent * 0.4;

    return {
        horizon: "monthly", // Labeled monthly but it's really "recent momentum"
        target,
        confidence: Math.min(0.8, months.length / 3), // Moderate cap — momentum is useful but volatile
        cv: cv(months.map(([, v]) => v)),
    };
}

/**
 * Expense-lead signal: if last month had high expenses, predict lower income.
 * Based on observed -0.60 cross-correlation between prior month expenses
 * and current month income. This captures the pattern that high-spending
 * months tend to be followed by low-earning months.
 */
function expenseLeadSignal(
    transactions: Transaction[],
    referenceDate: Date
): IncomeSignal {
    // Get monthly expense totals
    const byMonth = new Map<string, number>();
    for (const tx of transactions) {
        if (tx.pending || tx.amount <= 0) continue; // Plaid: positive = expense
        const cat = Array.isArray(tx.category) ? tx.category[0] : tx.category;
        if (cat === "Transfer") continue;
        const m = tx.date.substring(0, 7);
        byMonth.set(m, (byMonth.get(m) || 0) + tx.amount);
    }

    // Get the most recent full month's expenses
    const refMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;
    const months = [...byMonth.entries()]
        .filter(([m]) => m < refMonth)
        .sort((a, b) => a[0].localeCompare(b[0]));

    if (months.length < 3) return { horizon: "monthly", target: 0, confidence: 0, cv: 1 };

    const lastExpense = months[months.length - 1][1];
    const medianExpense = median(months.map(([, v]) => v));

    // Also need median income to know the baseline
    // (this is hacky — extracting from the function's own income data)
    // Use a simple heuristic: if expenses were above median, predict
    // income 20% below the overall median income. If below, predict 20% above.
    const expenseRatio = lastExpense / medianExpense;

    // We don't know the median income here, so return a SCALING FACTOR
    // via the target field. This will be used as a multiplier.
    // >1 = predict higher than baseline, <1 = predict lower
    const scaleFactor = expenseRatio > 1.2 ? 0.75 : expenseRatio < 0.8 ? 1.25 : 1.0;

    return {
        horizon: "monthly",
        target: scaleFactor, // This is a multiplier, not a dollar amount!
        confidence: 0, // Don't include in blend — handled separately
        cv: 0.5,
    };
}

function yearlyTrendSignal(
    income: { date: string; amount: number }[],
): IncomeSignal {
    const byYear = new Map<string, number>();
    for (const tx of income) {
        const y = tx.date.substring(0, 4);
        byYear.set(y, (byYear.get(y) || 0) + tx.amount);
    }

    const years = [...byYear.entries()].sort();
    if (years.length < 2) {
        return { horizon: "yearly", target: 0, confidence: 0, cv: 1 };
    }

    // Only use full years (skip first and last if partial)
    const fullYears = years.filter(([y]) => {
        const yearTxs = income.filter(tx => tx.date.startsWith(y));
        const months = new Set(yearTxs.map(tx => tx.date.substring(5, 7)));
        return months.size >= 10; // At least 10 months of data
    });

    if (fullYears.length < 1) {
        return { horizon: "yearly", target: 0, confidence: 0, cv: 1 };
    }

    // Latest full year → monthly rate
    const latestFull = fullYears[fullYears.length - 1];
    const monthlyFromYearly = latestFull[1] / 12;

    // Growth trend if we have multiple full years
    let growthFactor = 1;
    if (fullYears.length >= 2) {
        const prev = fullYears[fullYears.length - 2][1];
        const curr = latestFull[1];
        growthFactor = curr / prev;
    }

    return {
        horizon: "yearly",
        target: monthlyFromYearly * Math.max(0.7, Math.min(1.3, growthFactor)),
        confidence: Math.min(1, fullYears.length / 3),
        cv: cv(fullYears.map(([, v]) => v / 12)),
    };
}

// ─── Blend Signals ──────────────────────────────────────────

/**
 * Blend multiple signals using confidence-weighted average.
 * 
 * Strategy: quarterly is king (most stable), then recent momentum,
 * then seasonal, then weekly/yearly as tiebreakers.
 * 
 * For highly variable income, we also apply a conservatism bias —
 * it's better to under-predict than over-predict income.
 */
function blendSignals(signals: IncomeSignal[]): number {
    const valid = signals.filter(s => s.target > 0 && s.confidence > 0);
    if (valid.length === 0) return 0;

    // Horizon-specific base weights — quarterly dominates because it's
    // the most stable signal (CV ~20-25% vs 50%+ for monthly)
    const horizonWeights: Record<string, number> = {
        quarterly: 5.0,   // Most stable, most weight
        monthly: 1.5,     // Seasonal + momentum — useful but noisy
        weekly: 0.5,      // Very noisy, light grounding only
        yearly: 0.5,      // Trend signal only
        biweekly: 1.0,
    };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const s of valid) {
        const baseWeight = horizonWeights[s.horizon] || 1;
        const stabilityBonus = 1 / (1 + s.cv);
        const weight = baseWeight * s.confidence * stabilityBonus;
        weightedSum += s.target * weight;
        totalWeight += weight;
    }

    const blended = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Mild conservative bias for highly variable signals
    const avgCV = mean(valid.map(s => s.cv));
    const conservatismFactor = avgCV > 0.5 ? 0.9 : 1.0;

    return blended * conservatismFactor;
}

/**
 * Calculate a monthly "lumpy income allowance" from check deposits
 * and other sporadic income sources that the main forecast engine
 * filters as noise. Uses quarterly average as the estimate.
 */
function calcLumpyIncomeAllowance(
    transactions: Transaction[],
    forecastMonth: Date
): number {
    const lumpyTxs: { date: string; amount: number }[] = [];

    for (const tx of transactions) {
        if (tx.pending || tx.amount >= 0) continue;
        const cat = Array.isArray(tx.category) ? tx.category[0] : tx.category;
        if (cat === "Transfer") continue;
        const name = tx.merchant_name || tx.name || "";
        if (LUMPY_INCOME_PATTERNS.some(p => p.test(name))) {
            lumpyTxs.push({ date: tx.date, amount: Math.abs(tx.amount) });
        }
    }

    if (lumpyTxs.length < 2) return 0;

    // Get quarterly totals for same quarter across years
    const targetQ = Math.ceil((forecastMonth.getMonth() + 1) / 3);
    const byQuarter = new Map<string, number>();
    for (const tx of lumpyTxs) {
        const m = parseInt(tx.date.substring(5, 7));
        const y = tx.date.substring(0, 4);
        const q = Math.ceil(m / 3);
        const key = `${y}-Q${q}`;
        byQuarter.set(key, (byQuarter.get(key) || 0) + tx.amount);
    }

    // Same quarter average → monthly rate, with conservative discount
    const sameQTotals = [...byQuarter.entries()]
        .filter(([k]) => k.endsWith(`Q${targetQ}`))
        .map(([, v]) => v / 3);

    if (sameQTotals.length === 0) {
        // Fallback: overall quarterly average
        const allQ = [...byQuarter.values()].map(v => v / 3);
        if (allQ.length === 0) return 0;
        return median(allQ) * 0.25; // Very heavy discount for low confidence
    }

    // Use median of same-quarter monthly rates, discounted 30%
    // (conservative because lumpy income is unpredictable)
    return median(sameQTotals) * 0.35; // Heavy discount — lumpy income is very unpredictable
}

// ─── Main API ───────────────────────────────────────────────

/**
 * Generate multi-horizon income targets for each forecast month.
 * 
 * @param transactions Full transaction history (Plaid convention)
 * @param referenceDate Forecast reference date
 * @param months Number of months to forecast (default 3)
 */
export function predictMultiHorizonIncome(
    transactions: Transaction[],
    referenceDate: Date,
    months: number = 3
): MultiHorizonIncomeTarget[] {
    const realIncome = extractRealIncome(transactions);

    if (realIncome.length < 5) {
        // Not enough income data — return zero targets
        return Array.from({ length: months }, (_, i) => {
            const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1 + i, 1);
            return {
                month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
                target: 0,
                signals: [],
                confidence: "low" as const,
            };
        });
    }

    const results: MultiHorizonIncomeTarget[] = [];

    for (let i = 0; i < months; i++) {
        const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1 + i, 1);
        const calMonth = d.getMonth() + 1;
        const quarter = Math.ceil(calMonth / 3);
        const monthStr = `${d.getFullYear()}-${String(calMonth).padStart(2, "0")}`;

        const signals: IncomeSignal[] = [
            weeklySignal(realIncome, calMonth),
            recentMomentumSignal(realIncome, d),
            monthlySeasonalSignal(realIncome, calMonth),
            quarterlySignal(realIncome, quarter),
            yearlyTrendSignal(realIncome),
        ];

        const blendedTarget = blendSignals(signals);

        const avgConfidence = mean(signals.filter(s => s.target > 0).map(s => s.confidence));

        results.push({
            month: monthStr,
            target: Math.round(blendedTarget * 100) / 100,
            signals,
            confidence: avgConfidence > 0.6 ? "high" : avgConfidence > 0.3 ? "medium" : "low",
        });
    }

    return results;
}
