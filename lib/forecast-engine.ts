/**
 * Forecast Engine — Pre-processing & Post-processing for AI predictions.
 *
 * Instead of dumping raw transactions into Gemini and hoping it finds patterns,
 * we do the heavy statistical lifting ourselves (recurring detection, frequency
 * analysis, amount averaging) then hand the model a clean, pre-analyzed profile
 * so it only needs to SCHEDULE known patterns — not discover them.
 */

import { cleanMerchantName } from "./merchants";
import { inferCategory } from "./categories";
import type { Transaction, Forecast } from "@/types";

// ─── Internal Types ─────────────────────────────────────────

interface CleanTransaction {
    date: string;
    merchant: string;
    amount: number; // negative = expense, positive = income
    category: string;
    day_of_week: string;
}

export interface RecurringSeries {
    merchant: string;
    category: string;
    type: "expense" | "income";
    cadence: "weekly" | "biweekly" | "monthly" | "quarterly";
    anchor_day: number; // day-of-month for monthly+, day-of-week index (0=Sun) for weekly
    typical_amount: number;
    amount_is_fixed: boolean;
    last_occurrence: string;
    count: number;
    confidence: "high" | "medium" | "low";
}

export interface DiscretionaryPattern {
    category: string;
    avg_weekly_count: number;
    avg_amount: number;
    typical_merchants: string[];
}

export interface FinancialProfile {
    analysis_date: string;
    forecast_start: string;
    forecast_end: string;
    history_span_days: number;
    total_transactions_analyzed: number;
    recurring_series: RecurringSeries[];
    discretionary_patterns: DiscretionaryPattern[];
    monthly_averages: {
        total_income: number;
        total_expenses: number;
        net_cash_flow: number;
    };
    /** Last 60 cleaned transactions for Gemini edge-case detection */
    recent_transactions: CleanTransaction[];
}

// ─── Utility Functions ──────────────────────────────────────

const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

function daysBetween(a: string, b: string): number {
    return Math.abs(
        (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
    );
}

function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const avg = average(arr);
    return Math.sqrt(
        arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length
    );
}

function roundTo(n: number, d: number): number {
    const f = 10 ** d;
    return Math.round(n * f) / f;
}

function formatDate(d: Date): string {
    return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

// ─── Step 1: Clean Raw Transactions ─────────────────────────

function cleanTransactions(raw: Transaction[]): CleanTransaction[] {
    return raw
        .filter((tx) => !tx.pending)
        .map((tx) => {
            const amount = tx.amount * -1; // Plaid→Standard: flip sign
            const merchant = cleanMerchantName(tx.merchant_name || tx.name || "");
            const category = inferCategory(tx);
            const date = tx.date;
            const day_of_week = DAY_NAMES[new Date(date + "T12:00:00").getDay()]; // noon to avoid TZ issues
            return { date, merchant, amount, category, day_of_week };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Step 2: Detect Recurring Patterns ──────────────────────

function detectRecurringSeries(txs: CleanTransaction[]): RecurringSeries[] {
    // Group by merchant
    const byMerchant = new Map<string, CleanTransaction[]>();
    for (const tx of txs) {
        if (!byMerchant.has(tx.merchant)) byMerchant.set(tx.merchant, []);
        byMerchant.get(tx.merchant)!.push(tx);
    }

    const series: RecurringSeries[] = [];

    for (const [merchant, all] of byMerchant.entries()) {
        if (all.length < 2) continue;

        // Analyze expenses and income separately for this merchant
        const expenses = all.filter((t) => t.amount < 0);
        const income = all.filter((t) => t.amount > 0);

        const groups: { txs: CleanTransaction[]; type: "expense" | "income" }[] = [];
        if (expenses.length >= 2) groups.push({ txs: expenses, type: "expense" });
        if (income.length >= 2) groups.push({ txs: income, type: "income" });

        for (const { txs: groupTxs, type } of groups) {
            const sorted = [...groupTxs].sort((a, b) =>
                a.date.localeCompare(b.date)
            );

            // Compute inter-transaction gaps (in days)
            const gaps: number[] = [];
            for (let i = 1; i < sorted.length; i++) {
                gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
            }
            if (gaps.length === 0) continue;

            const med = median(gaps);

            // Map median gap → cadence
            let cadence: RecurringSeries["cadence"] | null = null;
            if (med >= 5 && med <= 9) cadence = "weekly";
            else if (med >= 12 && med <= 16) cadence = "biweekly";
            else if (med >= 25 && med <= 35) cadence = "monthly";
            else if (med >= 80 && med <= 100) cadence = "quarterly";
            if (!cadence) continue;

            // Check consistency (std-dev of gaps)
            const gapSD = stdDev(gaps);
            const maxSD =
                cadence === "weekly"
                    ? 3
                    : cadence === "biweekly"
                      ? 5
                      : cadence === "monthly"
                        ? 8
                        : 15;
            if (gapSD > maxSD) continue;

            const consistency = med > 0 ? Math.max(0, 1 - gapSD / med) : 0;

            // Amount analysis
            const amounts = sorted.map((t) => t.amount);
            const avg = average(amounts);
            const amtSD = stdDev(amounts);
            const isFixed =
                Math.abs(avg) > 0 ? amtSD / Math.abs(avg) < 0.05 : false;

            // Anchor day (last occurrence is most reliable reference)
            const lastTx = sorted[sorted.length - 1];
            const lastDate = new Date(lastTx.date + "T12:00:00");
            const anchorDay =
                cadence === "weekly"
                    ? lastDate.getDay() // 0-6
                    : lastDate.getDate(); // 1-31

            series.push({
                merchant,
                category: lastTx.category,
                type,
                cadence,
                anchor_day: anchorDay,
                typical_amount: roundTo(
                    isFixed ? amounts[amounts.length - 1] : avg,
                    2
                ),
                amount_is_fixed: isFixed,
                last_occurrence: lastTx.date,
                count: sorted.length,
                confidence:
                    consistency > 0.8
                        ? "high"
                        : consistency > 0.6
                          ? "medium"
                          : "low",
            });
        }
    }

    return series.sort(
        (a, b) => Math.abs(b.typical_amount) - Math.abs(a.typical_amount)
    );
}

// ─── Step 3: Detect Discretionary Patterns ──────────────────

function detectDiscretionaryPatterns(
    txs: CleanTransaction[],
    recurringMerchants: Set<string>
): DiscretionaryPattern[] {
    // Non-recurring expenses only (exclude transfers, income, recurring)
    const disc = txs.filter(
        (tx) =>
            !recurringMerchants.has(tx.merchant) &&
            tx.category !== "Transfer" &&
            tx.category !== "Income" &&
            tx.amount < 0
    );

    const byCategory = new Map<string, CleanTransaction[]>();
    for (const tx of disc) {
        if (!byCategory.has(tx.category)) byCategory.set(tx.category, []);
        byCategory.get(tx.category)!.push(tx);
    }

    const patterns: DiscretionaryPattern[] = [];

    for (const [category, catTxs] of byCategory.entries()) {
        if (catTxs.length < 3) continue;

        const dates = catTxs.map((t) => new Date(t.date).getTime());
        const spanWeeks =
            (Math.max(...dates) - Math.min(...dates)) / 604_800_000;
        if (spanWeeks < 2) continue;

        // Merchant frequency
        const freq = new Map<string, number>();
        for (const tx of catTxs)
            freq.set(tx.merchant, (freq.get(tx.merchant) || 0) + 1);
        const topMerchants = [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);

        patterns.push({
            category,
            avg_weekly_count: roundTo(catTxs.length / spanWeeks, 1),
            avg_amount: roundTo(average(catTxs.map((t) => t.amount)), 2),
            typical_merchants: topMerchants,
        });
    }

    return patterns.sort(
        (a, b) =>
            Math.abs(b.avg_amount * b.avg_weekly_count) -
            Math.abs(a.avg_amount * a.avg_weekly_count)
    );
}

// ─── Step 4: Compute Monthly Averages ───────────────────────

function calcMonthlyAverages(txs: CleanTransaction[]) {
    if (txs.length === 0)
        return { total_income: 0, total_expenses: 0, net_cash_flow: 0 };

    const byMonth = new Map<string, { income: number; expenses: number }>();
    for (const tx of txs) {
        const key = tx.date.substring(0, 7); // YYYY-MM
        if (!byMonth.has(key)) byMonth.set(key, { income: 0, expenses: 0 });
        const m = byMonth.get(key)!;
        if (tx.amount > 0) m.income += tx.amount;
        else m.expenses += Math.abs(tx.amount);
    }

    // Drop first & last (likely partial months)
    const months = [...byMonth.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
    );
    const full = months.length > 2 ? months.slice(1, -1) : months;
    if (full.length === 0)
        return { total_income: 0, total_expenses: 0, net_cash_flow: 0 };

    const avgInc = roundTo(average(full.map(([, m]) => m.income)), 2);
    const avgExp = roundTo(average(full.map(([, m]) => m.expenses)), 2);
    return {
        total_income: avgInc,
        total_expenses: avgExp,
        net_cash_flow: roundTo(avgInc - avgExp, 2),
    };
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Analyze raw transaction history and produce a structured financial profile
 * that the LLM can use to generate accurate predictions without doing
 * statistical pattern detection itself.
 */
export function buildFinancialProfile(
    rawTransactions: Transaction[]
): FinancialProfile {
    const today = new Date();
    const start = addDays(today, 1);
    const end = addDays(today, 90);
    const cleaned = cleanTransactions(rawTransactions);

    if (cleaned.length === 0) {
        return {
            analysis_date: formatDate(today),
            forecast_start: formatDate(start),
            forecast_end: formatDate(end),
            history_span_days: 0,
            total_transactions_analyzed: 0,
            recurring_series: [],
            discretionary_patterns: [],
            monthly_averages: {
                total_income: 0,
                total_expenses: 0,
                net_cash_flow: 0,
            },
            recent_transactions: [],
        };
    }

    const historyDays = daysBetween(
        cleaned[0].date,
        cleaned[cleaned.length - 1].date
    );
    const recurring = detectRecurringSeries(cleaned);
    const recurringMerchants = new Set(recurring.map((r) => r.merchant));
    const discretionary = detectDiscretionaryPatterns(
        cleaned,
        recurringMerchants
    );
    const nonTransfers = cleaned.filter((tx) => tx.category !== "Transfer");
    const monthlyAvg = calcMonthlyAverages(nonTransfers);

    return {
        analysis_date: formatDate(today),
        forecast_start: formatDate(start),
        forecast_end: formatDate(end),
        history_span_days: Math.round(historyDays),
        total_transactions_analyzed: cleaned.length,
        recurring_series: recurring,
        discretionary_patterns: discretionary,
        monthly_averages: monthlyAvg,
        recent_transactions: cleaned.slice(-60), // most recent 60
    };
}

/**
 * Validate and clean up the raw forecast that comes back from Gemini.
 * Filters bad dates, deduplicates, fixes missing fields, and sorts.
 */
export function validateForecast(raw: Forecast): Forecast {
    const today = new Date();
    const tomorrow = formatDate(addDays(today, 1));
    const maxDate = formatDate(addDays(today, 91));

    const validated = raw.predicted_transactions
        // 1. Must be within forecast window
        .filter((tx) => tx.date >= tomorrow && tx.date <= maxDate)
        // 2. Must have essential fields
        .filter(
            (tx) =>
                tx.date &&
                tx.merchant &&
                typeof tx.amount === "number" &&
                tx.amount !== 0
        )
        // 3. Fix/enrich fields
        .map((tx) => ({
            ...tx,
            day_of_week:
                DAY_NAMES[new Date(tx.date + "T12:00:00").getDay()],
            type: (tx.amount > 0 ? "income" : "expense") as
                | "income"
                | "expense",
            confidence_score: tx.confidence_score || ("medium" as const),
        }))
        // 4. Sort ascending by date
        .sort((a, b) => a.date.localeCompare(b.date));

    // 5. Dedup: same merchant + date + amount (within rounding)
    const seen = new Set<string>();
    const deduped = validated.filter((tx) => {
        const key = `${tx.date}|${tx.merchant}|${Math.round(tx.amount * 100)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return {
        forecast_period_days: raw.forecast_period_days || 90,
        predicted_transactions: deduped,
    };
}
