/**
 * Forecast Engine v3 — Deterministic + Statistical Hybrid
 *
 * Key improvements over v2:
 *  - Split payments within same merchant merged before analysis
 *  - Transfers/CC payments/P2P filtered from recurring detection
 *  - Trend sign works correctly for expenses (absolute-value based)
 *  - Weekend adjustment only for ACH-style bills, not SaaS subscriptions
 *  - Anchor day uses MODE across all history, not just last occurrence
 *  - Outlier-resistant: uses median amounts + IQR filtering
 *  - CC payment, Venmo, Robinhood noise automatically excluded
 *
 * Architecture:
 *  1. Clean & normalize raw transactions
 *  2. Merge split payments (same merchant within 10-day window)
 *  3. Filter noise (transfers, CC payments, P2P)
 *  4. Detect recurring series with flexible cadence matching
 *  5. Detect discretionary spending patterns with day-of-week weighting
 *  6. DETERMINISTICALLY schedule recurring items for next 90 days
 *  7. STATISTICALLY generate discretionary items for next 90 days
 *  8. Merge, validate, and return the complete forecast
 */

import { cleanMerchantName } from "./merchants";
import { inferCategory } from "./categories";
import type { Transaction, Forecast, PredictedTransaction } from "@/types";

// ─── Internal Types ─────────────────────────────────────────

interface CleanTransaction {
    date: string;
    merchant: string;
    amount: number; // negative = expense, positive = income
    category: string;
    day_of_week: number; // 0=Sun … 6=Sat
}

export interface RecurringSeries {
    merchant: string;
    category: string;
    type: "expense" | "income";
    cadence: "weekly" | "biweekly" | "monthly" | "quarterly";
    anchor_day: number;
    typical_amount: number;
    recent_amount: number; // weighted toward most recent occurrences
    amount_trend: number; // positive = getting more expensive, negative = getting cheaper
    amount_is_fixed: boolean;
    is_subscription: boolean; // SaaS/digital — posts on exact date, no weekend shift
    last_occurrence: string;
    count: number;
    confidence: "high" | "medium" | "low";
}

export interface DiscretionaryPattern {
    category: string;
    avg_weekly_count: number;
    avg_amount: number;
    recent_avg_amount: number;
    amount_std_dev: number;
    typical_merchants: string[];
    day_of_week_weights: number[]; // [Sun..Sat] probability weights
}

// ─── Noise Filters ──────────────────────────────────────────

/** Merchants/patterns that are transfers, not real expenses/income */
const NOISE_MERCHANT_PATTERNS = [
    /payment.*chase.*card/i,
    /payment.*thank.*you/i,
    /automatic\s*payment/i,
    /chase.*credit.*crd/i,
    /autopay/i,
    /online\s*transfer/i,
    /acct\s*xfer/i,
    /acct\s*transfer/i,
    /statement\s*credit/i,
    /interest\s*payment/i,
    /redemption\s*credit/i,
    /statement\s*credit\s*adjust/i,
];

/** Categories that should never appear in forecasts */
const EXCLUDED_CATEGORIES = new Set(["Transfer", "Income"]);

/** Merchants that are SaaS/subscriptions (post on exact date, not ACH weekend-shifted) */
const SUBSCRIPTION_PATTERNS = [
    /digitalocean/i, /supabase/i, /github/i, /google.*cloud/i,
    /codetwo/i, /playstation/i, /netflix/i, /spotify/i,
    /hulu/i, /disney/i, /hbo/i, /apple.*music/i, /youtube/i,
    /amazon.*prime/i, /anthropic/i, /openai/i, /adobe/i,
    /railway/i, /render/i, /vercel/i, /aws/i, /li\s*drum/i,
    /microsoft/i, /creem/i, /help\.?max/i,
];

function isNoiseMerchant(merchant: string): boolean {
    return NOISE_MERCHANT_PATTERNS.some((p) => p.test(merchant));
}

function isSubscription(merchant: string): boolean {
    return SUBSCRIPTION_PATTERNS.some((p) => p.test(merchant));
}

// ─── Utility Functions ──────────────────────────────────────

const DAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
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

/** Mode: most frequent value (rounded to nearest cent) */
function mode(arr: number[]): number {
    if (arr.length === 0) return 0;
    const freq = new Map<number, number>();
    for (const v of arr) {
        const key = Math.round(v * 100);
        freq.set(key, (freq.get(key) || 0) + 1);
    }
    let bestKey = 0;
    let bestCount = 0;
    for (const [key, count] of freq) {
        if (count > bestCount) { bestCount = count; bestKey = key; }
    }
    return bestKey / 100;
}

/** Mode for integers (day-of-month) */
function modeInt(arr: number[]): number {
    if (arr.length === 0) return 1;
    const freq = new Map<number, number>();
    for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
    let best = arr[arr.length - 1];
    let bestCount = 0;
    for (const [val, count] of freq) {
        if (count > bestCount || (count === bestCount && val < best)) {
            bestCount = count; best = val;
        }
    }
    return best;
}

function weightedRecentAvg(arr: number[]): number {
    if (arr.length === 0) return 0;
    if (arr.length === 1) return arr[0];
    const n = arr.length;
    let totalWeight = 0;
    let weightedSum = 0;
    for (let i = 0; i < n; i++) {
        const weight = Math.pow(1.5, i); // newer items at higher indices
        weightedSum += arr[i] * weight;
        totalWeight += weight;
    }
    return weightedSum / totalWeight;
}

function stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const avg = average(arr);
    return Math.sqrt(
        arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length
    );
}

/** Remove outliers using IQR method, return cleaned array */
function removeOutliers(arr: number[]): number[] {
    if (arr.length < 4) return arr;
    const sorted = [...arr].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const cleaned = arr.filter((v) => v >= lower && v <= upper);
    return cleaned.length > 0 ? cleaned : arr; // fallback to original if all filtered
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

function parseDate(s: string): Date {
    return new Date(s + "T12:00:00"); // noon to avoid TZ issues
}

/** Seeded pseudo-random for reproducible forecasts within a day */
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}

// ─── Step 1: Clean Raw Transactions ─────────────────────────

function cleanTransactions(raw: Transaction[]): CleanTransaction[] {
    return raw
        .filter((tx) => !tx.pending)
        .filter((tx) => {
            // Check noise on RAW name BEFORE merchant cleaning
            // (cleaning can normalize "PAYMENT TO CHASE CARD" → just "Chase")
            const rawName = (tx.merchant_name || tx.name || "");
            return !isNoiseMerchant(rawName);
        })
        .map((tx) => {
            const amount = tx.amount * -1; // Plaid→Standard: flip sign
            const rawName = tx.merchant_name || tx.name || "";
            const merchant = cleanMerchantName(rawName);
            const category = inferCategory(tx);
            const date = tx.date;
            const day_of_week = parseDate(date).getDay();
            return { date, merchant, amount, category, day_of_week };
        })
        .filter((tx) => !isNoiseMerchant(tx.merchant)) // also check cleaned name
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Step 1b: Merge Split Payments ──────────────────────────

/**
 * If the same merchant has multiple transactions within a 10-day window,
 * merge them into one logical transaction (sum of amounts, earliest date).
 * Handles split rent payments, partial refunds, etc.
 */
function mergeSplitPayments(txs: CleanTransaction[]): CleanTransaction[] {
    const byMerchant = new Map<string, CleanTransaction[]>();
    for (const tx of txs) {
        if (!byMerchant.has(tx.merchant)) byMerchant.set(tx.merchant, []);
        byMerchant.get(tx.merchant)!.push(tx);
    }

    const result: CleanTransaction[] = [];

    for (const [, mtxs] of byMerchant) {
        const sorted = [...mtxs].sort((a, b) => a.date.localeCompare(b.date));

        // Group transactions within 10-day clusters
        let cluster: CleanTransaction[] = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const gapFromLast = daysBetween(cluster[cluster.length - 1].date, sorted[i].date);
            const spanFromFirst = daysBetween(cluster[0].date, sorted[i].date);
            // Same sign check: don't merge expense with income
            const sameSign =
                (cluster[0].amount < 0 && sorted[i].amount < 0) ||
                (cluster[0].amount > 0 && sorted[i].amount > 0);

            // Merge if: within 10 days of last item AND total cluster span ≤ 15 days
            // The span cap prevents chaining (A→B→C where A-C > 15 days)
            if (gapFromLast <= 10 && spanFromFirst <= 15 && sameSign) {
                cluster.push(sorted[i]);
            } else {
                // Flush cluster
                result.push(mergeCluster(cluster));
                cluster = [sorted[i]];
            }
        }
        result.push(mergeCluster(cluster));
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
}

function mergeCluster(cluster: CleanTransaction[]): CleanTransaction {
    if (cluster.length === 1) return cluster[0];
    const totalAmount = cluster.reduce((s, tx) => s + tx.amount, 0);
    // Use the earliest date in the cluster
    return {
        date: cluster[0].date,
        merchant: cluster[0].merchant,
        amount: roundTo(totalAmount, 2),
        category: cluster[0].category,
        day_of_week: cluster[0].day_of_week,
    };
}

// ─── Step 2: Detect Recurring Patterns (v3) ────────────────

function detectRecurringSeries(txs: CleanTransaction[]): RecurringSeries[] {
    // Merge split payments FIRST — handles split rent, partial charges
    const merged = mergeSplitPayments(txs);

    // Filter out transfers and P2P — never forecast these
    const forecastable = merged.filter(
        (tx) => !EXCLUDED_CATEGORIES.has(tx.category)
    );

    // Group by merchant
    const byMerchant = new Map<string, CleanTransaction[]>();
    for (const tx of forecastable) {
        if (!byMerchant.has(tx.merchant)) byMerchant.set(tx.merchant, []);
        byMerchant.get(tx.merchant)!.push(tx);
    }

    const series: RecurringSeries[] = [];

    for (const [merchant, all] of byMerchant.entries()) {
        if (all.length < 2) continue;

        // Separate expenses and income
        const expenses = all.filter((t) => t.amount < 0);
        const income = all.filter((t) => t.amount > 0);

        const groups: { txs: CleanTransaction[]; type: "expense" | "income" }[] = [];
        if (expenses.length >= 2) groups.push({ txs: expenses, type: "expense" });
        if (income.length >= 2) groups.push({ txs: income, type: "income" });

        for (const { txs: groupTxs, type } of groups) {
            const sorted = [...groupTxs].sort((a, b) => a.date.localeCompare(b.date));

            // Compute inter-transaction gaps
            const gaps: number[] = [];
            for (let i = 1; i < sorted.length; i++) {
                gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
            }
            if (gaps.length === 0) continue;

            const med = median(gaps);

            // Flexible cadence detection
            let cadence: RecurringSeries["cadence"] | null = null;
            if (med >= 4 && med <= 10) cadence = "weekly";
            else if (med >= 11 && med <= 18) cadence = "biweekly";
            else if (med >= 22 && med <= 40) cadence = "monthly";
            else if (med >= 75 && med <= 110) cadence = "quarterly";
            if (!cadence) continue;

            // Relaxed consistency check
            const gapSD = stdDev(gaps);
            const maxSD =
                cadence === "weekly" ? 4 :
                cadence === "biweekly" ? 6 :
                cadence === "monthly" ? 10 : 20;
            if (gapSD > maxSD) continue;

            const consistency = med > 0 ? Math.max(0, 1 - gapSD / med) : 0;

            // ── Amount analysis (outlier-resistant) ──
            const rawAmounts = sorted.map((t) => t.amount);
            const amounts = removeOutliers(rawAmounts);
            const absAmounts = amounts.map(Math.abs);
            const recentAbsAmounts = absAmounts.slice(-3);

            // Use MEDIAN for typical amount (resists outliers)
            const typicalAbs = median(absAmounts);
            // Use weighted recent for prediction
            const recentAbs = weightedRecentAvg(absAmounts);
            // Is it fixed? Check CV of cleaned amounts
            const amtCV = typicalAbs > 0 ? stdDev(absAmounts) / typicalAbs : 0;
            const isFixed = amtCV < 0.08;

            // ── Trend on ABSOLUTE values (positive = getting more expensive) ──
            let trend = 0;
            if (absAmounts.length >= 4) {
                const olderAbs = average(absAmounts.slice(0, -3));
                const newerAbs = average(recentAbsAmounts);
                if (olderAbs > 0) {
                    trend = roundTo((newerAbs - olderAbs) / olderAbs, 3);
                }
            }

            // ── Anchor day: use MODE across all occurrences ──
            const lastTx = sorted[sorted.length - 1];
            let anchorDay: number;
            if (cadence === "weekly") {
                anchorDay = modeInt(sorted.map((t) => parseDate(t.date).getDay()));
            } else {
                // Monthly/quarterly: use mode of day-of-month
                anchorDay = modeInt(sorted.map((t) => parseDate(t.date).getDate()));
            }

            // Restore sign for amounts
            const sign = type === "expense" ? -1 : 1;

            series.push({
                merchant,
                category: lastTx.category,
                type,
                cadence,
                anchor_day: anchorDay,
                typical_amount: roundTo(typicalAbs * sign, 2),
                recent_amount: roundTo(recentAbs * sign, 2),
                amount_trend: trend,
                amount_is_fixed: isFixed,
                is_subscription: isSubscription(merchant),
                last_occurrence: lastTx.date,
                count: sorted.length,
                confidence:
                    consistency > 0.75 ? "high" :
                    consistency > 0.5 ? "medium" : "low",
            });
        }
    }

    // ── Staleness filter: skip series that have lapsed ──
    // If the last occurrence is more than 2.5× the cadence period before today,
    // the user likely cancelled the subscription/service.
    const today = formatDate(new Date());
    const cadenceDays: Record<string, number> = {
        weekly: 7, biweekly: 14, monthly: 30, quarterly: 90
    };

    const activeSeries = series.filter((s) => {
        const daysSinceLast = daysBetween(s.last_occurrence, today);
        const threshold = cadenceDays[s.cadence] * 2.5;
        return daysSinceLast <= threshold;
    });

    return activeSeries.sort(
        (a, b) => Math.abs(b.recent_amount) - Math.abs(a.recent_amount)
    );
}

// ─── Step 3: Detect Discretionary Patterns (v3) ────────────

function detectDiscretionaryPatterns(
    txs: CleanTransaction[],
    recurringMerchants: Set<string>
): DiscretionaryPattern[] {
    // Exclude recurring merchants, transfers, income, and noise
    const disc = txs.filter(
        (tx) =>
            !recurringMerchants.has(tx.merchant) &&
            !EXCLUDED_CATEGORIES.has(tx.category) &&
            tx.amount < 0
    );

    const byCategory = new Map<string, CleanTransaction[]>();
    for (const tx of disc) {
        if (!byCategory.has(tx.category)) byCategory.set(tx.category, []);
        byCategory.get(tx.category)!.push(tx);
    }

    const patterns: DiscretionaryPattern[] = [];

    // Use only recent 6 months for frequency calculations
    // (spending habits change; ancient data drags averages)
    const sixMonthsAgo = formatDate(addDays(new Date(), -180));
    const recentTxs = txs.filter((tx) => tx.date >= sixMonthsAgo);
    const recentHistoryDays = recentTxs.length > 1
        ? daysBetween(recentTxs[0].date, recentTxs[recentTxs.length - 1].date)
        : 1;
    const recentWeeks = Math.max(1, recentHistoryDays / 7);

    for (const [category, catTxs] of byCategory.entries()) {
        if (catTxs.length < 3) continue;

        // Count recent transactions for frequency (last 6 months)
        const recentCatTxs = catTxs.filter((tx) => tx.date >= sixMonthsAgo);
        const weeklyCount = recentCatTxs.length > 0
            ? recentCatTxs.length / recentWeeks
            : catTxs.length / Math.max(1, daysBetween(catTxs[0].date, catTxs[catTxs.length - 1].date) / 7);

        // Day-of-week distribution (from recent data)
        const recentForWeights = recentCatTxs.length >= 3 ? recentCatTxs : catTxs;
        const dayWeights = new Array(7).fill(0);
        for (const tx of recentForWeights) dayWeights[tx.day_of_week]++;
        const dayTotal = dayWeights.reduce((s, v) => s + v, 0);
        const normalizedWeights = dayTotal > 0
            ? dayWeights.map((w) => roundTo(w / dayTotal, 3))
            : new Array(7).fill(1 / 7);

        // Merchant frequency
        const freq = new Map<string, number>();
        for (const tx of catTxs)
            freq.set(tx.merchant, (freq.get(tx.merchant) || 0) + 1);
        const topMerchants = [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name]) => name);

        // Outlier-resistant amounts
        const rawAmounts = catTxs.map((t) => t.amount);
        const cleanedAmounts = removeOutliers(rawAmounts);
        const recentAmounts = catTxs.slice(-Math.ceil(catTxs.length / 3)).map((t) => t.amount);
        const cleanedRecent = removeOutliers(recentAmounts);

        patterns.push({
            category,
            avg_weekly_count: roundTo(weeklyCount, 2),
            avg_amount: roundTo(median(cleanedAmounts), 2),
            recent_avg_amount: roundTo(median(cleanedRecent), 2),
            amount_std_dev: roundTo(stdDev(cleanedAmounts), 2),
            typical_merchants: topMerchants,
            day_of_week_weights: normalizedWeights,
        });
    }

    return patterns.sort(
        (a, b) =>
            Math.abs(b.recent_avg_amount * b.avg_weekly_count) -
            Math.abs(a.recent_avg_amount * a.avg_weekly_count)
    );
}

// ─── Step 4: DETERMINISTIC Recurring Scheduler ──────────────

function scheduleRecurringItems(
    series: RecurringSeries[],
    startDate: Date,
    endDate: Date
): PredictedTransaction[] {
    const results: PredictedTransaction[] = [];
    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    for (const s of series) {
        // For fixed amounts, use exact recent. For variable, use recent weighted avg.
        const baseAbs = Math.abs(s.amount_is_fixed ? s.recent_amount : s.recent_amount);
        const sign = s.type === "expense" ? -1 : 1;

        // Compute all occurrence dates within window
        const dates = computeOccurrences(s, startDate, endDate);

        for (let i = 0; i < dates.length; i++) {
            const dateStr = formatDate(dates[i]);
            if (dateStr < startStr || dateStr > endStr) continue;

            let absAmount = baseAbs;
            if (!s.amount_is_fixed && s.amount_trend !== 0) {
                // Trend: on absolute values, positive trend = getting more expensive
                const monthsOut = i / (s.cadence === "weekly" ? 4 : s.cadence === "biweekly" ? 2 : 1);
                // Cap trend influence to ±30% max
                const trendAdj = 1 + Math.max(-0.3, Math.min(0.3, s.amount_trend * monthsOut * 0.1));
                absAmount = absAmount * trendAdj;
            }

            results.push({
                date: dateStr,
                day_of_week: DAY_NAMES[dates[i].getDay()],
                merchant: s.merchant,
                amount: roundTo(absAmount * sign, 2),
                category: s.category,
                type: s.type,
                confidence_score: s.confidence,
            });
        }
    }

    return results;
}

function computeOccurrences(
    s: RecurringSeries,
    startDate: Date,
    endDate: Date
): Date[] {
    const dates: Date[] = [];
    const lastOccurrence = parseDate(s.last_occurrence);
    const shouldShiftWeekend = !s.is_subscription; // Only ACH-style bills shift for weekends

    if (s.cadence === "weekly") {
        let d = new Date(lastOccurrence);
        d.setDate(d.getDate() + 7);
        while (d <= endDate) {
            if (d >= startDate) {
                dates.push(shouldShiftWeekend ? adjustForWeekend(new Date(d)) : new Date(d));
            }
            d.setDate(d.getDate() + 7);
        }
    } else if (s.cadence === "biweekly") {
        let d = new Date(lastOccurrence);
        d.setDate(d.getDate() + 14);
        while (d <= endDate) {
            if (d >= startDate) {
                dates.push(shouldShiftWeekend ? adjustForWeekend(new Date(d)) : new Date(d));
            }
            d.setDate(d.getDate() + 14);
        }
    } else if (s.cadence === "monthly") {
        const d = new Date(lastOccurrence);
        for (let m = 1; m <= 4; m++) {
            const next = new Date(d.getFullYear(), d.getMonth() + m, 1);
            const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
            const day = Math.min(s.anchor_day, daysInMonth);
            next.setDate(day);
            if (next > endDate) break;
            if (next >= startDate) {
                dates.push(shouldShiftWeekend ? adjustForWeekend(next) : next);
            }
        }
    } else if (s.cadence === "quarterly") {
        const d = new Date(lastOccurrence);
        for (let q = 1; q <= 2; q++) {
            const next = new Date(d.getFullYear(), d.getMonth() + (q * 3), 1);
            const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
            const day = Math.min(s.anchor_day, daysInMonth);
            next.setDate(day);
            if (next > endDate) break;
            if (next >= startDate) {
                dates.push(shouldShiftWeekend ? adjustForWeekend(next) : next);
            }
        }
    }

    return dates;
}

/** Only shift ACH-style bills off weekends. Subscriptions post on exact date. */
function adjustForWeekend(d: Date): Date {
    const dow = d.getDay();
    if (dow === 0) { d.setDate(d.getDate() + 1); } // Sun → Mon
    else if (dow === 6) { d.setDate(d.getDate() - 1); } // Sat → Fri
    return d;
}

// ─── Step 5: STATISTICAL Discretionary Scheduler ────────────

function scheduleDiscretionaryItems(
    patterns: DiscretionaryPattern[],
    startDate: Date,
    endDate: Date,
    seed: number
): PredictedTransaction[] {
    const results: PredictedTransaction[] = [];
    const rand = seededRandom(seed);
    const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);

    for (const p of patterns) {
        // Total expected transactions in the forecast window
        const expectedCount = Math.round(p.avg_weekly_count * (totalDays / 7));
        if (expectedCount <= 0) continue;

        // Use recent average for amounts (more predictive than all-time)
        const baseAmount = p.recent_avg_amount || p.avg_amount;
        const variance = Math.min(Math.abs(p.amount_std_dev), Math.abs(baseAmount) * 0.4);

        // Distribute across days using day-of-week weights
        // Build a weighted day pool
        const dayPool: number[] = [];
        for (let day = 0; day < totalDays; day++) {
            const d = addDays(startDate, day);
            const dow = d.getDay();
            // Weight: base DOW weight, plus small random jitter
            const weight = p.day_of_week_weights[dow] || (1 / 7);
            // Add this day proportional to its weight
            const slots = Math.round(weight * 10);
            for (let s = 0; s < Math.max(1, slots); s++) {
                dayPool.push(day);
            }
        }

        // Pick random days from the pool
        const chosenDays = new Set<number>();
        let attempts = 0;
        while (chosenDays.size < expectedCount && attempts < expectedCount * 10) {
            const idx = Math.floor(rand() * dayPool.length);
            chosenDays.add(dayPool[idx]);
            attempts++;
        }

        // Sort and generate transactions
        const sortedDays = [...chosenDays].sort((a, b) => a - b);
        let merchantIdx = 0;

        for (const dayOffset of sortedDays) {
            const d = addDays(startDate, dayOffset);
            const dateStr = formatDate(d);

            // Amount with bounded gaussian-ish noise
            const noise = (rand() + rand() + rand() - 1.5) / 1.5; // approx normal [-1, 1]
            let amount = roundTo(baseAmount + noise * variance * 0.5, 2);
            // Ensure expense stays expense, income stays income
            if (baseAmount < 0 && amount > 0) amount = roundTo(baseAmount * 0.8, 2);
            if (baseAmount > 0 && amount < 0) amount = roundTo(baseAmount * 0.8, 2);

            // Rotate through merchants
            const merchant = p.typical_merchants[merchantIdx % p.typical_merchants.length];
            merchantIdx++;

            results.push({
                date: dateStr,
                day_of_week: DAY_NAMES[d.getDay()],
                merchant,
                amount,
                category: p.category,
                type: amount < 0 ? "expense" : "income",
                confidence_score: "medium",
            });
        }
    }

    return results;
}

// ─── Step 6: Monthly Averages ───────────────────────────────

function calcMonthlyAverages(txs: CleanTransaction[]) {
    if (txs.length === 0)
        return { total_income: 0, total_expenses: 0, net_cash_flow: 0 };

    // Exclude only transfers and noise merchants — keep Income for total_income calc
    const filtered = txs.filter((tx) => tx.category !== "Transfer" && !isNoiseMerchant(tx.merchant));
    if (filtered.length === 0)
        return { total_income: 0, total_expenses: 0, net_cash_flow: 0 };

    const byMonth = new Map<string, { income: number; expenses: number }>();
    for (const tx of filtered) {
        const key = tx.date.substring(0, 7);
        if (!byMonth.has(key)) byMonth.set(key, { income: 0, expenses: 0 });
        const m = byMonth.get(key)!;
        if (tx.amount > 0) m.income += tx.amount;
        else m.expenses += Math.abs(tx.amount);
    }

    const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // Drop partial first & last months
    const full = months.length > 2 ? months.slice(1, -1) : months;
    if (full.length === 0)
        return { total_income: 0, total_expenses: 0, net_cash_flow: 0 };

    // Use last 4 full months, median for outlier resistance
    const recent = full.slice(-4);
    const medInc = roundTo(median(recent.map(([, m]) => m.income)), 2);
    const medExp = roundTo(median(recent.map(([, m]) => m.expenses)), 2);
    return {
        total_income: medInc,
        total_expenses: medExp,
        net_cash_flow: roundTo(medInc - medExp, 2),
    };
}

// ─── Public: Financial Profile (for optional AI refinement) ─

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
    recent_transactions: CleanTransaction[];
}

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
            monthly_averages: { total_income: 0, total_expenses: 0, net_cash_flow: 0 },
            recent_transactions: [],
        };
    }

    const historyDays = daysBetween(cleaned[0].date, cleaned[cleaned.length - 1].date);
    const recurring = detectRecurringSeries(cleaned);
    const recurringMerchants = new Set(recurring.map((r) => r.merchant));
    const discretionary = detectDiscretionaryPatterns(cleaned, recurringMerchants);
    const monthlyAvg = calcMonthlyAverages(cleaned);

    return {
        analysis_date: formatDate(today),
        forecast_start: formatDate(start),
        forecast_end: formatDate(end),
        history_span_days: Math.round(historyDays),
        total_transactions_analyzed: cleaned.length,
        recurring_series: recurring,
        discretionary_patterns: discretionary,
        monthly_averages: monthlyAvg,
        recent_transactions: cleaned.slice(-60),
    };
}

// ─── Public: Generate Complete Forecast (NO LLM needed) ─────

/**
 * Generate a full 90-day forecast deterministically.
 * This replaces the LLM for core scheduling — recurring items are computed
 * exactly, discretionary items are sampled from statistical distributions.
 */
export function generateDeterministicForecast(
    rawTransactions: Transaction[]
): Forecast {
    const today = new Date();
    const start = addDays(today, 1);
    const end = addDays(today, 90);
    const cleaned = cleanTransactions(rawTransactions);

    if (cleaned.length === 0) {
        return { forecast_period_days: 90, predicted_transactions: [] };
    }

    // Detect patterns
    const recurring = detectRecurringSeries(cleaned);
    const recurringMerchants = new Set(recurring.map((r) => r.merchant));
    const discretionary = detectDiscretionaryPatterns(cleaned, recurringMerchants);

    // Schedule deterministically
    const recurringTxs = scheduleRecurringItems(recurring, start, end);

    // Seed based on today's date for reproducible but varying forecasts
    const seed = parseInt(formatDate(today).replace(/-/g, ""), 10);
    const discretionaryTxs = scheduleDiscretionaryItems(discretionary, start, end, seed);

    // Merge and sort
    const all = [...recurringTxs, ...discretionaryTxs]
        .sort((a, b) => a.date.localeCompare(b.date));

    // Dedup: same merchant + date + rounded amount
    const seen = new Set<string>();
    const deduped = all.filter((tx) => {
        const key = `${tx.date}|${tx.merchant}|${Math.round(tx.amount * 100)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return {
        forecast_period_days: 90,
        predicted_transactions: deduped,
    };
}

// ─── Public: Validate (kept for backward compat) ────────────

/**
 * Validate and clean up a raw forecast (from Gemini or deterministic).
 */
export function validateForecast(raw: Forecast): Forecast {
    const today = new Date();
    const tomorrow = formatDate(addDays(today, 1));
    const maxDate = formatDate(addDays(today, 91));

    const validated = raw.predicted_transactions
        .filter((tx) => tx.date >= tomorrow && tx.date <= maxDate)
        .filter(
            (tx) =>
                tx.date &&
                tx.merchant &&
                typeof tx.amount === "number" &&
                tx.amount !== 0
        )
        .map((tx) => ({
            ...tx,
            day_of_week: DAY_NAMES[parseDate(tx.date).getDay()],
            type: (tx.amount > 0 ? "income" : "expense") as "income" | "expense",
            confidence_score: tx.confidence_score || ("medium" as const),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

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
