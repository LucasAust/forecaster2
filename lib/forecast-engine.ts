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

type IncomeSource =
    | "payroll"
    | "interest"
    | "cashout"
    | "check_deposit"
    | "refund"
    | "transfer_like"
    | "other";

interface IncomeTransaction extends CleanTransaction {
    source: IncomeSource;
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
    /acct\s*xfer/i,
    /acct\s*transfer/i,
    /statement\s*credit/i,
    /interest\s*charge/i,       // interest you PAY on debt (not savings interest earned)
    /interest\s*payment/i,
    /redemption\s*credit/i,
    /statement\s*credit\s*adjust/i,
    /cashback.*bonus|cash.*back.*redemption/i,
    /directpay.*full.*balance/i,
    /internet\s*payment.*thank/i,
    // CC/loan payments that appear as plain bank name with no "payment" prefix
    /^(discover\s*e-?|discover\s*payment)/i,
    /^apple\s*card\s*payment/i,
    /^sofi\s*(loan|personal|payment)/i,
    /cc\s*payment/i,
    /card\s*payment/i,
    /loan\s*payment/i,
];

/**
 * Categories excluded from BOTH recurring and discretionary detection.
 * Income is intentionally NOT excluded here — payroll / direct deposits are
 * the most predictable recurring transactions and must appear in forecasts.
 * Discretionary detection already excludes income naturally via `tx.amount < 0`.
 */
const EXCLUDED_CATEGORIES = new Set(["Transfer"]);

const STABLE_INCOME_MERCHANT_PATTERNS = [
    /payroll|direct\s*deposit|direct\s*dep|salary|wage|pay\s*check/i,
    /adp|gusto|paychex|workday|rippling|ukg|ceridian|bamboohr|paycom/i,
    /irs\s*\/\s*treasury|irs\s*treas|treasury/i,
    /interest\s*payment|interest\s*paid/i,
    /venmo\s*income/i,
    // Add more comprehensive payroll patterns based on real-world data
    /employer|company.*pay|corporate.*pay/i,
    /deposit\s*payroll|payroll\s*deposit/i,
    /ach\s*credit.*salary|ach\s*credit.*wage/i,
    /bi.*weekly.*pay|weekly.*pay|monthly.*salary/i,
];

const VOLATILE_INCOME_MERCHANT_PATTERNS = [
    /cash\s*redemption|bonus|cashback|redemption\s*credit/i,
    /check\s*deposit|remote\s*online\s*deposit/i,
    /paypal|cash\s*app|zelle/i,
    /refund|reimb/i,
];

/**
 * Categories where spending is inherently sporadic / event-driven.
 * These require MORE historical evidence to be treated as recurring,
 * and should never be projected just because someone did it twice.
 */
const SPORADIC_CATEGORIES = new Set([
    "Travel",         // Flights, hotels — seasonal, around holidays/events
    "Entertainment",  // Concerts, movies — event-driven
    "Shopping",       // One-off purchases, not bills
    "Personal Care",  // Haircuts every few months, not clock-like
    "Gifts & Donations", // Seasonal (holidays, birthdays)
]);

/**
 * Merchant patterns that should NEVER be treated as recurring.
 * These are inherently one-off or event-driven purchases, even if
 * someone has done them multiple times in history.
 */
const NEVER_RECURRING_PATTERNS = [
    // Airlines — flights are seasonal, around holidays / events
    /allegiant|allegnt/i, /southwest/i, /united\s*air/i, /delta\s*air/i,
    /american\s*air/i, /jetblue/i, /frontier/i, /spirit\s*air/i,
    /ryanair/i, /british\s*air/i, /lufthansa/i, /air\s*canada/i,
    // Hotels / Lodging
    /marriott/i, /hilton/i, /hyatt/i, /airbnb/i, /vrbo/i,
    /holiday\s*inn/i, /best\s*western/i, /hampton/i,
    // Travel services
    /expedia/i, /booking\.com/i, /trivago/i, /kayak/i,
    // Shipping (one-off)
    /usps/i, /fedex/i, /ups\b/i,
    // Legal / professional services (one-off)
    /clerky/i,
    // Shopping items that are one-off purchases
    /luggage/i, /premium.*luggage/i,
];

function isNeverRecurring(merchant: string): boolean {
    return NEVER_RECURRING_PATTERNS.some((p) => p.test(merchant));
}

/** Merchants that are SaaS/subscriptions (post on exact date, not ACH weekend-shifted) */
const SUBSCRIPTION_PATTERNS = [
    // Dev / Cloud infrastructure
    /digitalocean/i, /supabase/i, /github/i, /google.*cloud/i,
    /codetwo/i, /railway/i, /render/i, /vercel/i, /aws/i,
    /li\s*drum/i, /creem/i, /heroku/i, /netlify/i, /cloudflare/i,
    /datadog/i, /sentry\.io/i, /linear\.app/i, /planetscale/i,
    // AI / Productivity SaaS
    /anthropic/i, /openai/i, /microsoft/i, /adobe/i,
    /dropbox/i, /notion/i, /figma/i, /canva/i, /1password/i,
    /lastpass/i, /bitwarden/i, /todoist/i, /evernote/i,
    // Streaming / Media
    /netflix/i, /spotify/i, /hulu/i, /disney/i, /hbo/i, /help\.?max/i,
    /apple.*music/i, /youtube/i, /amazon.*prime/i, /audible/i,
    /peacock.*tv|peacocktv/i, /paramount\+|paramount.*plus/i,
    /apple.*tv\+?/i, /discovery\+/i, /fubo/i, /sling/i, /philo/i,
    /tidal/i, /deezer/i, /pandora/i, /iheart/i,
    // iCloud / Apple services
    /icloud/i, /apple.*one/i,
    // Gaming subscriptions
    /playstation|\bpsn\b/i, /nintendo.*online/i, /xbox.*game.*pass/i,
    /steam/i, /twitch\s*(sub|prime)/i, /discord.*nitro/i,
    // Food delivery passes
    /dashpass/i, /grubhub\+/i, /instacart.*express/i,
    // VPN services (recurring monthly)
    /nordvpn/i, /expressvpn/i, /surfshark/i, /protonvpn/i,
];

function isNoiseMerchant(merchant: string): boolean {
    return NOISE_MERCHANT_PATTERNS.some((p) => p.test(merchant));
}

function isSubscription(merchant: string): boolean {
    return SUBSCRIPTION_PATTERNS.some((p) => p.test(merchant));
}

function isStableIncomeMerchant(merchant: string): boolean {
    return STABLE_INCOME_MERCHANT_PATTERNS.some((p) => p.test(merchant));
}

function isVolatileIncomeMerchant(merchant: string): boolean {
    return VOLATILE_INCOME_MERCHANT_PATTERNS.some((p) => p.test(merchant));
}

function classifyIncomeSource(merchant: string, category: string): IncomeSource {
    const merchantLc = merchant.toLowerCase();
    const categoryLc = category.toLowerCase();

    if (/payroll|salary|wage|direct\s*deposit|direct\s*dep|adp|gusto|paychex|workday|rippling|ukg|ceridian|bamboohr|paycom/.test(merchantLc)) {
        return "payroll";
    }
    if (/interest\s*payment|interest\s*paid|interest\s*credit/.test(merchantLc)) {
        return "interest";
    }
    if (/venmo\s*income|cashout|cash\s*out/.test(merchantLc)) {
        return "cashout";
    }
    if (/check\s*deposit|remote\s*online\s*deposit|deposit\s+id\s+number|\bid\s*number\b/.test(merchantLc)) {
        return "check_deposit";
    }
    if (/refund|reimb|reimbursement|treasury|irs/.test(merchantLc)) {
        return "refund";
    }
    if (categoryLc === "transfer" || /transfer|xfer|zelle|paypal|cash\s*app/.test(merchantLc)) {
        return "transfer_like";
    }
    return "other";
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

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const clampedP = clamp(p, 0, 100);
    const idx = (clampedP / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const w = idx - lo;
    return sorted[lo] * (1 - w) + sorted[hi] * w;
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

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function formatDate(d: Date): string {
    return d.toISOString().split("T")[0];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: string): boolean {
    if (!DATE_RE.test(value)) return false;
    const parsed = parseDate(value);
    return !Number.isNaN(parsed.getTime());
}

function sanitizeMerchantName(value: string): string {
    const cleaned = value.trim().replace(/\s+/g, " ");
    return cleaned.length > 0 ? cleaned : "Unknown Merchant";
}

function getEnvNumber(name: string, fallback: number, min?: number, max?: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    if (typeof min === "number" && parsed < min) return min;
    if (typeof max === "number" && parsed > max) return max;
    return parsed;
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

// ── Amount-aware Transfer → Income override ──────────────────────────────
// Catches Plaid-labeled Transfer transactions that are actually income:
//   1. Plaid category array contains income-related subcategories
//   2. OR the merchant/name itself contains income-related keywords
// Both the category array AND the raw name are checked because some banks
// just return ["Transfer"] with no subcategory (e.g., generic direct deposit).
const INCOME_NAME_PATTERNS =
    /payroll|direct\s*dep|\bach\s*credit\b|salary|wage|interest\s*(paid|earn|credit)|tax\s*refund|irs\s*treas|reimb|bonus\s*pay|commission|tip\s*income|dividend|venmo\s*cashout|online\s*transfer\s*from\s*chk|real\s*time\s*payment\s*credit\s*recd|deposit\s+id\s+number/i;

const INCOME_CATEGORY_PATTERNS =
    /payroll|direct\s*dep|deposit|income|salary|interest\s*(earn|paid|credit)|tax\s*refund|reimb/;

function normalizeForecastCategory(category: string): string {
    if (category === "Income" || category === "Transfer" || category === "Housing" || category === "Utilities") {
        return category;
    }
    if (category === "Groceries" || category === "Food & Drink" || category === "Shopping") {
        return "Groceries";
    }
    if (category === "Transport" || category === "Auto" || category === "Travel") {
        return "Transport";
    }
    if (category === "Healthcare" || category === "Personal Care") {
        return "Healthcare";
    }
    if (category === "Subscriptions" || category === "Entertainment") {
        return "Entertainment";
    }
    if (category === "Insurance") {
        return "Utilities";
    }
    return "Other";
}

function buildOutgoingTransferIndex(raw: Transaction[]): Map<number, string[]> {
    const index = new Map<number, string[]>();

    for (const tx of raw) {
        if (tx.pending) continue;
        if (typeof tx.amount !== "number" || !Number.isFinite(tx.amount) || tx.amount <= 0) continue;
        if (typeof tx.date !== "string" || !isValidDateString(tx.date)) continue;

        const plaidTop = (Array.isArray(tx.category)
            ? (tx.category[0] ?? "")
            : tx.category ?? "").toLowerCase().trim();
        if (plaidTop !== "transfer") continue;

        const cents = Math.round(Math.abs(tx.amount) * 100);
        const dates = index.get(cents) || [];
        dates.push(tx.date);
        index.set(cents, dates);
    }

    return index;
}

function hasNearbyOutgoingTransfer(
    plaidAmountAbs: number,
    date: string,
    outgoingTransferIndex: Map<number, string[]>,
    maxGapDays: number = 1,
): boolean {
    const dates = outgoingTransferIndex.get(Math.round(plaidAmountAbs * 100));
    if (!dates || dates.length === 0) return false;
    return dates.some((candidateDate) => daysBetween(candidateDate, date) <= maxGapDays);
}

function cleanTransactions(raw: Transaction[]): CleanTransaction[] {
    const outgoingTransferIndex = buildOutgoingTransferIndex(raw);

    const cleaned = raw
        .filter((tx) => !tx.pending)
        .filter((tx) => typeof tx.amount === "number" && Number.isFinite(tx.amount) && tx.amount !== 0)
        .filter((tx) => typeof tx.date === "string" && isValidDateString(tx.date))
        .filter((tx) => {
            // Check noise on RAW name BEFORE merchant cleaning
            const rawName = (tx.merchant_name || tx.name || "");
            return !isNoiseMerchant(rawName);
        })
        // ── Outgoing Plaid-Transfer filter ────────────────────────────────────
        // When Plaid's top-level category is "Transfer" and the transaction is an
        // outgoing payment (positive Plaid amount = money out = expense after flip),
        // it's a CC payment, loan payment, or inter-bank transfer — not real spending.
        // Filter these before mapping so they don't pollute expense patterns OR
        // get double-counted alongside the individual charges they're paying off.
        .filter((tx) => {
            const plaidTop = (Array.isArray(tx.category)
                ? (tx.category[0] ?? '')
                : tx.category ?? '').toLowerCase().trim();
            
            // Only filter outgoing transfers that look like payments/CC payments
            if (plaidTop === 'transfer' && tx.amount > 0) {
                const rawName = (tx.merchant_name || tx.name || '').toLowerCase();
                // If it looks like a payment to a CC/loan, filter it out
                const isPayment = /payment|autopay|auto\s*pay|cc\s*payment|card\s*payment|loan\s*payment/i.test(rawName) ||
                                 /chase.*card|discover|apple.*card|sofi|capital.*one/i.test(rawName);
                return !isPayment; // Filter out payments, keep other transfers that might be income
            }
            return true;
        })
        .map((tx) => {
            const flippedAmount = tx.amount * -1; // Plaid→Standard: positive=income, negative=expense
            const rawName = tx.merchant_name || tx.name || "";
            const merchant = sanitizeMerchantName(cleanMerchantName(rawName));
            let category = inferCategory(tx) as string;
            const date = tx.date;
            const day_of_week = parseDate(date).getDay();

            // ── Enhanced Transfer → Income override ────────────────────────
            // Be more aggressive in detecting income that Plaid misclassified as transfers
            if (category === "Transfer" && flippedAmount > 0) {
                const allCats = (Array.isArray(tx.category)
                    ? tx.category
                    : [tx.category || ''])
                    .join(' ').toLowerCase();
                const rawNameStr = (tx.merchant_name || tx.name || '').toLowerCase();
                const looksIncomeLike = INCOME_CATEGORY_PATTERNS.test(allCats) || INCOME_NAME_PATTERNS.test(rawNameStr);
                const hasMirrorTransfer = hasNearbyOutgoingTransfer(Math.abs(tx.amount), tx.date, outgoingTransferIndex);
                
                // More aggressive income detection: include large incoming transfers that don't have mirror outgoing transfers
                const isLargeIncomingTransfer = flippedAmount > 100 && !hasMirrorTransfer;
                
                if (looksIncomeLike || isLargeIncomingTransfer) {
                    category = "Income";
                }
            }

            category = normalizeForecastCategory(category);

            return { date, merchant, amount: roundTo(flippedAmount, 2), category, day_of_week };
        })
        .filter((tx) => !isNoiseMerchant(tx.merchant)) // also check cleaned name
        .sort((a, b) => a.date.localeCompare(b.date));

    // ── Deduplicate: same date + merchant + amount = cross-account duplicate ──
    const seen = new Map<string, CleanTransaction>();
    for (const tx of cleaned) {
        const key = `${tx.date}|${tx.merchant}|${Math.round(tx.amount * 100)}`;
        if (!seen.has(key)) {
            seen.set(key, tx);
        }
    }
    return [...seen.values()];
}

// ─── Step 1b: Merge Split Payments ──────────────────────────

/**
 * If the same merchant has multiple transactions within a 10-day window
 * AND they have DIFFERENT amounts, merge them into one logical transaction
 * (sum of amounts, earliest date). Handles split rent payments, partial refunds, etc.
 *
 * Important: Does NOT merge transactions with identical amounts on the same day
 * or within 2 days — those are typically recurring charges, not split payments.
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

            // Don't merge if amounts are identical — that's likely separate recurring charges,
            // not a split payment (e.g., two $12.95 Spotify charges = error, not a $25.90 split)
            const hasIdenticalAmount = cluster.some(
                (c) => Math.round(c.amount * 100) === Math.round(sorted[i].amount * 100)
            );

            // Never merge income transactions — paychecks from the same employer
            // within a biweekly window have similar amounts but are SEPARATE deposits.
            const isIncome = cluster[0].amount > 0;

            // Merge if: within 10 days of last item AND total cluster span ≤ 15 days
            // AND amounts differ (to avoid summing duplicate charges)
            if (!isIncome && gapFromLast <= 10 && spanFromFirst <= 15 && sameSign && !hasIdenticalAmount) {
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

function detectRecurringSeries(
    txs: CleanTransaction[],
    referenceDate: Date = new Date()
): RecurringSeries[] {
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

        // ── Real-world guardrail: skip merchants that are never truly recurring ──
        // Airlines, hotels, shipping, legal services, etc. are event-driven.
        if (isNeverRecurring(merchant)) continue;

        // ── CONSERVATIVE minimum occurrence thresholds for stability ──
        // The original aggressive detection was creating unstable, spurious patterns.
        // Use higher thresholds to ensure only truly recurring patterns are detected.
        const primaryCategory = all[0]?.category || "Other";
        const isSub = isSubscription(merchant);
        const isIncomeSeries = all.every(t => t.amount > 0);
        const stableIncomeSeries = isIncomeSeries && isStableIncomeMerchant(merchant);
        
        // Much more conservative thresholds to prevent spurious patterns
        const expenseMinOccurrences = SPORADIC_CATEGORIES.has(primaryCategory) ? 4 : 3; // Increased requirements
        const incomeMinOccurrences = stableIncomeSeries ? 2 : 3; // Keep income detection reasonable
        const minOccurrences = isSub ? 3 : isIncomeSeries ? incomeMinOccurrences : expenseMinOccurrences; // Higher for subscriptions too

        if (all.length < minOccurrences) continue;

        // Separate expenses and income
        const expenses = all.filter((t) => t.amount < 0);
        const income = all.filter((t) => t.amount > 0);

        const groups: { txs: CleanTransaction[]; type: "expense" | "income" }[] = [];
        if (expenses.length >= expenseMinOccurrences) groups.push({ txs: expenses, type: "expense" });
        if (income.length >= incomeMinOccurrences) groups.push({ txs: income, type: "income" });

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

            // More aggressive income detection - allow more variability in income patterns
            if (type === "income" && !stableIncomeSeries) {
                if (sorted.length < 3) continue; // Reduced from 4 to 3  
                if (med < 7) continue; // Reduced from 11 to 7 - allow weekly income patterns
            }

            // Much more lenient consistency check for production-grade detection
            const gapSD = stdDev(gaps);
            // Special handling for income and subscriptions - they're inherently more predictable
            const isStablePattern = type === "income" || isSub;
            const maxSD = isStablePattern ? (
                cadence === "weekly" ? 8 :      // More lenient for stable patterns
                cadence === "biweekly" ? 10 :   // More lenient for stable patterns  
                cadence === "monthly" ? 15 :    // More lenient for stable patterns
                cadence === "quarterly" ? 30 : 35 // More lenient for stable patterns
            ) : (
                cadence === "weekly" ? 6 :      // Slightly increased
                cadence === "biweekly" ? 8 :    
                cadence === "monthly" ? 12 :    
                cadence === "quarterly" ? 25 : 30
            );
            if (gapSD > maxSD) continue;

            const consistency = med > 0 ? Math.max(0, 1 - gapSD / med) : 0;

            // ── Recency factor: confidence decays as the series approaches its staleness boundary ──
            // A series last seen 2 periods ago is less reliable than one seen last week,
            // even if its historical gap consistency was perfect.
            const daysSinceLast = daysBetween(sorted[sorted.length - 1].date, formatDate(referenceDate));
            const cadenceLen = cadence === "weekly" ? 7 : cadence === "biweekly" ? 14 : cadence === "monthly" ? 30 : 90;
            const maxStaleDays = cadenceLen * 2.5;
            const freshness = Math.max(0, Math.min(1, 1 - daysSinceLast / maxStaleDays));

            // ── Amount analysis (outlier-resistant) ──
            const rawAmounts = sorted.map((t) => t.amount);
            const amounts = removeOutliers(rawAmounts);
            const absAmounts = amounts.map(Math.abs);
            const recentAbsAmounts = absAmounts.slice(-3);

            // Use MEDIAN for typical amount (resists outliers)
            const typicalAbs = median(absAmounts);
            // Use weighted recent for prediction
            const recentAbs = weightedRecentAvg(absAmounts);
            
            // ── CONSERVATIVE amount threshold: skip tiny recurring patterns ──
            // Patterns under $10/month are likely spurious or irrelevant for forecasting
            const monthlyEquivalent = typicalAbs * (
                cadence === "weekly" ? 4.33 :     // ~4.33 weeks per month
                cadence === "biweekly" ? 2.17 :   // ~2.17 biweeks per month  
                cadence === "quarterly" ? 0.33 :  // ~0.33 quarters per month
                1  // monthly
            );
            if (monthlyEquivalent < 10) continue; // Skip patterns under $10/month
            
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

            const baseComposite = consistency * 0.7 + freshness * 0.3;
            
            // More sophisticated confidence scoring for production accuracy
            let adjustedComposite = baseComposite;
            
            // Major boosts for highly predictable patterns
            if (type === "income") {
                if (stableIncomeSeries) {
                    adjustedComposite = Math.min(1, baseComposite + 0.15); // Major boost for payroll
                    if (sorted.length >= 6) adjustedComposite = Math.min(1, adjustedComposite + 0.1); // Extra for long history
                } else {
                    adjustedComposite = Math.max(0.2, baseComposite - 0.05); // Slight penalty for variable income
                }
            }
            
            // Subscriptions get major boost - they're extremely predictable
            if (isSub) {
                adjustedComposite = Math.min(1, adjustedComposite + 0.2);
            }
            
            // Fixed amounts get confidence boost
            if (isFixed) {
                adjustedComposite = Math.min(1, adjustedComposite + 0.1);
            }
            
            // Long history gets confidence boost
            if (sorted.length >= 8) {
                adjustedComposite = Math.min(1, adjustedComposite + 0.05);
            }

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
                // Enhanced confidence scoring for production accuracy
                confidence: (() => {
                    return adjustedComposite > 0.75 ? "high" : adjustedComposite > 0.45 ? "medium" : "low";
                })() as "high" | "medium" | "low",
            });
        }
    }

    // ── Staleness filter: skip series that have lapsed ──
    // If the last occurrence is more than 2.5× the cadence period before today,
    // the user likely cancelled the subscription/service.
    const today = formatDate(referenceDate);
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
    recurringMerchants: Set<string>,
    referenceDate: Date = new Date()
): DiscretionaryPattern[] {
    // ── Seasonal awareness (computed early, shared throughout) ──
    // Use last 6 months EXCLUDING major holiday months (Nov-Dec) for frequency.
    // Holiday spending distorts projections into spring/summer.
    const today = referenceDate;
    const sixMonthsAgo = formatDate(addDays(today, -180));

    // Build set of recently-active merchants (seen in last 6 months).
    // Merchants inactive longer than 6 months are treated as lapsed/cancelled
    // and excluded from projections to prevent ghost expense projections
    // (e.g. old rent platforms, cancelled subscriptions).
    const recentlyActiveMerchants = new Set(
        txs
            .filter((tx) => tx.date >= sixMonthsAgo && tx.amount < 0)
            .map((tx) => tx.merchant)
    );

    // Exclude recurring merchants, transfers, income, noise, and never-recurring merchants.
    // Also exclude merchants not seen in the last 6 months (lapsed vendors).
    const disc = txs.filter(
        (tx) =>
            !recurringMerchants.has(tx.merchant) &&
            !EXCLUDED_CATEGORIES.has(tx.category) &&
            !isNeverRecurring(tx.merchant) &&
            recentlyActiveMerchants.has(tx.merchant) &&
            tx.amount < 0
    );

    const byCategory = new Map<string, CleanTransaction[]>();
    for (const tx of disc) {
        if (!byCategory.has(tx.category)) byCategory.set(tx.category, []);
        byCategory.get(tx.category)!.push(tx);
    }

    const patterns: DiscretionaryPattern[] = [];

    // Non-holiday recent transactions (exclude Nov & Dec for frequency calc)
    const recentTxs = txs.filter((tx) => tx.date >= sixMonthsAgo);
    const nonHolidayRecent = recentTxs.filter((tx) => {
        const month = parseInt(tx.date.substring(5, 7), 10);
        return month !== 11 && month !== 12; // Exclude Nov & Dec
    });
    // Use non-holiday data if we have enough, otherwise fall back to all recent
    const frequencyTxs = nonHolidayRecent.length >= 10 ? nonHolidayRecent : recentTxs;
    const recentHistoryDays = frequencyTxs.length > 1
        ? daysBetween(frequencyTxs[0].date, frequencyTxs[frequencyTxs.length - 1].date)
        : 1;
    const recentWeeks = Math.max(1, recentHistoryDays / 7);

    for (const [category, catTxs] of byCategory.entries()) {
        if (catTxs.length < 2) continue; // Reduced from 3 to 2

        // Travel is event-driven (flights, hotels) — never project as discretionary pattern
        if (category === "Travel") continue;

        // Housing and Utilities are fixed costs handled by recurring detection.
        // Including them in discretionary causes massive double-counting
        // (e.g., rent shows up in both recurring AND discretionary = 2x projection).
        if (category === "Housing" || category === "Utilities") continue;

        const catSpanDays = Math.max(1, daysBetween(catTxs[0].date, catTxs[catTxs.length - 1].date));
        // More lenient requirements for pattern inclusion
        if (catTxs.length < 3 && catSpanDays < 14) continue; // Reduced requirements

        // Count recent transactions for frequency (last 6 months).
        // Apply the same holiday exclusion that was used for recentWeeks so the
        // numerator and denominator are derived from the same date range — otherwise
        // Nov/Dec transactions inflate the rate against a shorter-span denominator.
        const recentCatTxs = catTxs.filter((tx) => {
            if (tx.date < sixMonthsAgo) return false;
            if (nonHolidayRecent.length >= 10) {
                const month = parseInt(tx.date.substring(5, 7), 10);
                return month !== 11 && month !== 12;
            }
            return true;
        });
        const weeklyCount = recentCatTxs.length > 0
            ? recentCatTxs.length / recentWeeks
            : catTxs.length / Math.max(1, daysBetween(catTxs[0].date, catTxs[catTxs.length - 1].date) / 7);

        // Less conservative evidence requirements to increase merchant coverage
        const countEvidence = Math.min(1, catTxs.length / 8); // Reduced from 12 to 8
        const spanEvidence = Math.min(1, catSpanDays / 60);  // Reduced from 84 to 60
        const evidenceWeight = Math.max(0.25, countEvidence * 0.6 + spanEvidence * 0.4); // Reduced minimum from 0.35 to 0.25
        const adjustedWeeklyCount = weeklyCount * evidenceWeight * 1.15; // Small boost to increase projections

        // Day-of-week distribution (from recent data)
        const recentForWeights = recentCatTxs.length >= 3 ? recentCatTxs : catTxs;
        const dayWeights = new Array(7).fill(0);
        for (const tx of recentForWeights) dayWeights[tx.day_of_week]++;
        const dayTotal = dayWeights.reduce((s, v) => s + v, 0);
        const normalizedWeights = dayTotal > 0
            ? dayWeights.map((w) => roundTo(w / dayTotal, 3))
            : new Array(7).fill(1 / 7);

        // Merchant frequency — only use last 6 months so stale/cancelled merchants
        // (e.g. old rent platforms, cancelled subscriptions) don't contaminate projections
        const recentCatTxs6mo = catTxs.filter((tx) => tx.date >= sixMonthsAgo);
        const merchantSource = recentCatTxs6mo.length > 0 ? recentCatTxs6mo : catTxs;
        const freq = new Map<string, number>();
        for (const tx of merchantSource)
            freq.set(tx.merchant, (freq.get(tx.merchant) || 0) + 1);
        const topMerchants = [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name]) => name);
        if (topMerchants.length === 0) continue;

        // Outlier-resistant amounts
        const rawAmounts = catTxs.map((t) => t.amount);
        const cleanedAmounts = removeOutliers(rawAmounts);
        const recentAmounts = catTxs.slice(-Math.ceil(catTxs.length / 3)).map((t) => t.amount);
        const cleanedRecent = removeOutliers(recentAmounts);

        patterns.push({
            category,
            avg_weekly_count: roundTo(adjustedWeeklyCount, 2),
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

// ─── Step 4b: Variable / Irregular Income Projection ────────

/**
 * Detect irregular income that doesn't fit a strict recurring cadence but still
 * recurs (e.g. hourly/tipped workers, freelance deposits, gig-economy payouts).
 * We look at Income transactions that were NOT captured by detectRecurringSeries,
 * compute a statistical weekly income rate, and project it forward.
 */
function scheduleVariableIncome(
    cleaned: CleanTransaction[],
    recurringMerchants: Set<string>,
    startDate: Date,
    endDate: Date,
    seed: number,
    referenceDate: Date = new Date()
): PredictedTransaction[] {
    // Simplified calibration - remove the 50+ env vars that make this system untunable
    const checkDepositMultiplier = 0.9;  // Check deposits tend to be irregular, conservative projection
    const cashoutMultiplier = 0.7;       // Cashouts are volatile, project conservatively  
    const otherIncomeMultiplier = 0.8;   // Other income sources, moderate projection
    const recentIncomeBoost = 0.15;      // Boost for income sources seen in last 30 days
    const maxProjectionCap = 8;          // Maximum projected transactions per source
    // Income transactions not already covered by recurring series.
    // Exclude Transfer-category transactions to prevent internal account
    // movements (savings↔checking, Zelle, etc.) from being projected as income.
    const nonRecurringIncomeBase = cleaned.filter(
        (tx) => tx.amount > 0
            && !recurringMerchants.has(tx.merchant)
            && !EXCLUDED_CATEGORIES.has(tx.category)
    );

    const nonRecurringIncome: IncomeTransaction[] = nonRecurringIncomeBase.map((tx) => ({
        ...tx,
        source: classifyIncomeSource(tx.merchant, tx.category),
    }));

    if (nonRecurringIncome.length < 3) return [];

    // Use a slightly longer lookback to capture sparse but still-repeating
    // deposit behavior (e.g. occasional check deposits) without relying on
    // stale, multi-year history.
    const today = referenceDate;
    const lookbackDays = Math.round(getEnvNumber("ARC_CAL_INCOME_LOOKBACK_DAYS", 90, 90, 540));
    const lookbackStart = formatDate(addDays(today, -lookbackDays));
    const recent = nonRecurringIncome.filter((tx) => tx.date >= lookbackStart);
    if (recent.length < 3) return [];

    const spanDays = Math.max(
        7,
        daysBetween(recent[0].date, recent[recent.length - 1].date)
    );
    if (recent.length < 5 && spanDays < 28) return [];

    const recentSourceCount = new Map<IncomeSource, number>();
    const recentSourceLastDate = new Map<IncomeSource, string>();
    for (const tx of recent) {
        recentSourceCount.set(tx.source, (recentSourceCount.get(tx.source) || 0) + 1);
        const prevDate = recentSourceLastDate.get(tx.source);
        if (!prevDate || tx.date > prevDate) recentSourceLastDate.set(tx.source, tx.date);
    }

    // Statistical summary
    const amounts = recent.map((t) => t.amount);
    const cleanAmounts = removeOutliers(amounts);
    const avgAmount = median(cleanAmounts);
    const amountSd = stdDev(cleanAmounts);
    if (avgAmount <= 0) return [];

    // Build merchant-level stats and project only repeated income sources (count >= 2)
    const byMerchant = new Map<string, IncomeTransaction[]>();
    for (const tx of recent) {
        if (!byMerchant.has(tx.merchant)) byMerchant.set(tx.merchant, []);
        byMerchant.get(tx.merchant)!.push(tx);
    }

    const globalMedianIncome = median(cleanAmounts);
    const globalIncomeCap = Math.max(globalMedianIncome * 2.2, globalMedianIncome + (amountSd * 2.5));

    const merchantStats = [...byMerchant.entries()]
        .map(([merchant, merchantTxs]) => {
            const merchantAmounts = merchantTxs.map((tx) => tx.amount);
            const cleanedMerchantAmts = removeOutliers(merchantAmounts);
            const sortedMerchantTxs = [...merchantTxs]
                .sort((a, b) => a.date.localeCompare(b.date));
            const merchantSpanDays = sortedMerchantTxs.length > 1
                ? Math.max(1, daysBetween(sortedMerchantTxs[0].date, sortedMerchantTxs[sortedMerchantTxs.length - 1].date))
                : 1;
            const merchantGaps: number[] = [];
            for (let i = 1; i < sortedMerchantTxs.length; i++) {
                merchantGaps.push(daysBetween(sortedMerchantTxs[i - 1].date, sortedMerchantTxs[i].date));
            }
            const cadenceDays = merchantGaps.length > 0 ? median(merchantGaps) : merchantSpanDays;
            const cadenceSd = merchantGaps.length > 1 ? stdDev(merchantGaps) : 0;
            const regularity = cadenceDays > 0 ? clamp(1 - (cadenceSd / cadenceDays), 0, 1) : 0;
            const evidence = clamp(
                Math.min(1, merchantAmounts.length / 8) * 0.6 +
                Math.min(1, merchantSpanDays / 90) * 0.4,
                0,
                1
            );
            const stableMerchant = isStableIncomeMerchant(merchant);
            const volatileMerchant = isVolatileIncomeMerchant(merchant);
            const sourceFreq = new Map<IncomeSource, number>();
            for (const tx of merchantTxs) {
                sourceFreq.set(tx.source, (sourceFreq.get(tx.source) || 0) + 1);
            }
            const recent30Count = merchantTxs.filter((tx) => daysBetween(tx.date, formatDate(today)) <= 30).length;
            const recent60Count = merchantTxs.filter((tx) => daysBetween(tx.date, formatDate(today)) <= 60).length;
            const daysSinceLast = daysBetween(sortedMerchantTxs[sortedMerchantTxs.length - 1].date, formatDate(today));
            const dominantSource = [...sourceFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "other";
            return {
                merchant,
                count: merchantAmounts.length,
                medianAmount: median(cleanedMerchantAmts),
                amountSd: stdDev(cleanedMerchantAmts),
                p80Amount: percentile(merchantAmounts, 80),
                p90Amount: percentile(merchantAmounts, 90),
                maxAmount: Math.max(...merchantAmounts),
                cadenceDays,
                regularity,
                evidence,
                stableMerchant,
                volatileMerchant,
                recent30Count,
                recent60Count,
                daysSinceLast,
                dominantSource,
            };
        })
        .filter((stats) => stats.count >= 2 && stats.medianAmount > 0)
        .filter((stats) => !(stats.volatileMerchant && stats.count < 3))
        .filter((stats) => !(stats.dominantSource === "other" && stats.count < 3))
        .filter((stats) => !(stats.dominantSource === "other" && stats.regularity < 0.35 && stats.count < 4))
        .sort((a, b) => b.count - a.count);

    if (merchantStats.length === 0) return [];

    // Generate projected deposits across the forecast window
    const results: Array<PredictedTransaction & { _source: IncomeSource }> = [];
    const rng = seededRandom(seed + 777);

    const forecastDays = daysBetween(formatDate(startDate), formatDate(endDate));

    for (const stats of merchantStats) {
        const cadenceDays = clamp(stats.cadenceDays || 14, 7, 45);
        const cadenceExpected = forecastDays / cadenceDays;
        const spanRateExpected = (stats.count / Math.max(30, spanDays)) * forecastDays;
        let expected = (cadenceExpected * 0.6 + spanRateExpected * 0.4)
            * Math.max(0.25, stats.evidence * 0.7 + stats.regularity * 0.3);

        // Balanced source multipliers - conservative but not overly aggressive
        const sourceMultiplier = (() => {
            switch (stats.dominantSource) {
                case "payroll": return 1.1; // Moderate boost for payroll
                case "interest": return 0.7; // Conservative - interest varies
                case "check_deposit": return 1.6; // Significant boost but not extreme - was 33% under
                case "cashout": return 0.8; // Moderate - we fixed this category well
                case "other": return 0.6; // Conservative - other income is unpredictable
                case "transfer_like": return 0.8; // Moderate conservative
                case "refund": return 0.4; // Conservative - refunds are sporadic
                default: return 0.6; // Default conservative
            }
        })();
        expected *= sourceMultiplier;

        // Boost recent activity
        const sourceLastDate = recentSourceLastDate.get(stats.dominantSource);
        const isRecentlyActive = sourceLastDate && daysBetween(sourceLastDate, formatDate(today)) <= 30;
        if (isRecentlyActive) expected *= (1 + recentIncomeBoost);

        // Simple staleness penalty
        const isStale = sourceLastDate && daysBetween(sourceLastDate, formatDate(today)) > 60;
        if (isStale) expected *= 0.6;

        // Conservative capping to prevent over-projection
        const expectedCount = clamp(Math.round(expected), 0, Math.min(maxProjectionCap, stats.count * 2));
        if (expectedCount <= 0) continue;

        const intervalDays = forecastDays / expectedCount;
        for (let i = 0; i < expectedCount; i++) {
            const baseDayOffset = i * intervalDays;
            const jitterRange = Math.min(2, intervalDays * 0.2);
            const jitter = (rng() - 0.5) * jitterRange * 2;
            const depositDay = addDays(startDate, Math.round(baseDayOffset + jitter));
            const depositDate = formatDate(depositDay);
            if (depositDate < formatDate(startDate) || depositDate > formatDate(endDate)) continue;

            // Simplified amount calculation
            const merchantBase = stats.medianAmount;
            const merchantSd = stats.amountSd || amountSd;
            const rawAmount = merchantBase + (rng() - 0.5) * Math.min(merchantSd, merchantBase * 0.3);
            
            // Simple amount cap: don't exceed 2x the largest historical amount
            const simpleCap = Math.min(globalIncomeCap, stats.maxAmount * 2);
            const amount = roundTo(clamp(rawAmount, 1, simpleCap), 2);

            // Enhanced confidence scoring for variable income
            const confidenceScore = (() => {
                if (stats.stableMerchant && stats.regularity > 0.7 && stats.count >= 6) return "high";
                if (stats.stableMerchant && stats.regularity > 0.5) return "medium";  
                if (stats.dominantSource === "check_deposit" && stats.regularity > 0.4) return "medium";
                return "low";
            })();

            results.push({
                date: depositDate,
                merchant: stats.merchant,
                amount,
                category: "Income",
                day_of_week: DAY_NAMES[depositDay.getDay()],
                type: "income",
                confidence_score: confidenceScore,
                _source: stats.dominantSource,
            });
        }
    }

    // Simplified fallback for one-off income sources
    const repeatedMerchants = new Set(merchantStats.map((stats) => stats.merchant));
    const miscIncome = recent.filter((tx) => {
        if (repeatedMerchants.has(tx.merchant)) return false;
        return tx.source === "other" || tx.source === "check_deposit";
    });

    // MUCH more aggressive misc income projection, especially for check deposits
    if (miscIncome.length >= 2) { // Reduced threshold from 3 to 2
        const miscAmounts = removeOutliers(miscIncome.map((tx) => tx.amount));
        const miscMedian = median(miscAmounts);
        const miscSd = stdDev(miscAmounts);
        
        // Check if this is primarily check deposits
        const checkDeposits = miscIncome.filter((tx) => tx.source === "check_deposit");
        const isCheckDepositHeavy = checkDeposits.length >= miscIncome.length * 0.4;
        
        // Moderate boost for check deposits while staying conservative overall
        const historicalRate = miscIncome.length / Math.max(30, spanDays);
        const multiplier = isCheckDepositHeavy ? 1.4 : 0.7; // Moderate boost for check deposits
        const projectedCount = clamp(Math.round(historicalRate * forecastDays * multiplier), 1, 6); // Reasonable max

        const miscInterval = forecastDays / Math.max(1, projectedCount);
        for (let i = 0; i < projectedCount; i++) {
            const dayOffset = i * miscInterval + (rng() - 0.5) * 7; // Increased jitter
            const depositDay = addDays(startDate, Math.round(dayOffset));
            const depositDate = formatDate(depositDay);
            if (depositDate < formatDate(startDate) || depositDate > formatDate(endDate)) continue;

            // For check deposits, use higher amounts (they're typically substantial)
            const baseAmount = isCheckDepositHeavy ? miscMedian * 1.1 : miscMedian;
            const varianceMultiplier = isCheckDepositHeavy ? 0.3 : 0.4;
            const rawAmount = baseAmount + (rng() - 0.5) * Math.min(miscSd, baseAmount * varianceMultiplier);
            const capMultiplier = isCheckDepositHeavy ? 4 : 3; // Higher cap for check deposits
            const amount = roundTo(clamp(rawAmount, 10, miscMedian * capMultiplier), 2);

            const merchantName = isCheckDepositHeavy ? "Check Deposit" : "Other Income";
            
            results.push({
                date: depositDate,
                merchant: merchantName,
                amount,
                category: "Income",
                day_of_week: DAY_NAMES[depositDay.getDay()],
                type: "income",
                confidence_score: isCheckDepositHeavy ? "medium" : "low", // Higher confidence for check deposits
                _source: isCheckDepositHeavy ? "check_deposit" : "other",
            });
        }
    }

    // Remove all the over-engineered calibration sections above
    // Keep it simple: the basic merchant-level and misc income projections are sufficient

    return results.map(({ _source, ...tx }) => tx);
}

function scheduleLumpyIncomeEvents(
    cleaned: CleanTransaction[],
    recurringIncomeMerchants: Set<string>,
    startDate: Date,
    endDate: Date,
    referenceDate: Date = new Date(),
): PredictedTransaction[] {
    const minAmount = getEnvNumber("ARC_CAL_LUMPY_MIN_AMOUNT", 1500, 500, 100000);
    const oneShotMinAmount = getEnvNumber("ARC_CAL_LUMPY_ONESHOT_MIN_AMOUNT", 8000, 1000, 200000);
    const recencyDays = Math.round(getEnvNumber("ARC_CAL_LUMPY_RECENCY_DAYS", 540, 120, 1460));
    const cadenceMinGapDays = Math.round(getEnvNumber("ARC_CAL_LUMPY_MIN_GAP_DAYS", 45, 20, 400));

    const candidates = cleaned.filter(
        (tx) =>
            tx.amount >= minAmount &&
            !EXCLUDED_CATEGORIES.has(tx.category) &&
            !recurringIncomeMerchants.has(tx.merchant),
    );

    if (candidates.length === 0) return [];

    const byMerchant = new Map<string, CleanTransaction[]>();
    for (const tx of candidates) {
        if (!byMerchant.has(tx.merchant)) byMerchant.set(tx.merchant, []);
        byMerchant.get(tx.merchant)!.push(tx);
    }

    const results: PredictedTransaction[] = [];
    const startIso = formatDate(startDate);
    const endIso = formatDate(endDate);
    const refIso = formatDate(referenceDate);

    for (const [merchant, merchantTxs] of byMerchant.entries()) {
        const sorted = [...merchantTxs].sort((a, b) => a.date.localeCompare(b.date));
        const recent = sorted.filter((tx) => daysBetween(tx.date, refIso) <= recencyDays);
        if (recent.length === 0) continue;

        if (recent.length >= 2) {
            const gaps: number[] = [];
            for (let i = 1; i < recent.length; i++) {
                gaps.push(daysBetween(recent[i - 1].date, recent[i].date));
            }
            const medGap = median(gaps);
            if (medGap < cadenceMinGapDays) continue;

            const lastDate = parseDate(recent[recent.length - 1].date);
            let nextDate = addDays(lastDate, Math.round(medGap));
            let guard = 0;
            while (formatDate(nextDate) < startIso && guard < 6) {
                nextDate = addDays(nextDate, Math.round(medGap));
                guard++;
            }

            const nextIso = formatDate(nextDate);
            if (nextIso < startIso || nextIso > endIso) continue;

            const amount = roundTo(median(recent.map((tx) => tx.amount)), 2);
            results.push({
                date: nextIso,
                merchant,
                amount,
                category: "Income",
                day_of_week: DAY_NAMES[nextDate.getDay()],
                type: "income",
                confidence_score: recent.length >= 3 ? "medium" : "low",
            });
            continue;
        }

        const single = recent[0];
        if (single.amount < oneShotMinAmount) continue;
        const daysSinceSingle = daysBetween(single.date, refIso);
        if (daysSinceSingle < 240) continue;

        const singleDate = parseDate(single.date);
        const month = singleDate.getMonth();
        const day = singleDate.getDate();
        const candidateYears = new Set<number>([startDate.getFullYear(), endDate.getFullYear(), endDate.getFullYear() + 1]);

        for (const year of candidateYears) {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const candidate = new Date(year, month, Math.min(day, daysInMonth), 12, 0, 0);
            const candidateIso = formatDate(candidate);
            if (candidateIso < startIso || candidateIso > endIso) continue;
            if (daysBetween(candidateIso, single.date) < 300) continue;

            results.push({
                date: candidateIso,
                merchant,
                amount: roundTo(single.amount * 0.98, 2),
                category: "Income",
                day_of_week: DAY_NAMES[candidate.getDay()],
                type: "income",
                confidence_score: "low",
            });
            break;
        }
    }

    return results;
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
        // For fixed amounts (e.g. Netflix $15.49), use the median — it's the most stable
        // representative value and ignores the influence of any single outlier occurrence.
        // For variable amounts (e.g. utility bills), use weighted-recent — it reflects the
        // current trend which is the most predictive of near-future amounts.
        const baseAbs = Math.abs(s.amount_is_fixed ? s.typical_amount : s.recent_amount);
        const sign = s.type === "expense" ? -1 : 1;

        // Compute all occurrence dates within window
        const dates = computeOccurrences(s, startDate, endDate);

        for (let i = 0; i < dates.length; i++) {
            const dateStr = formatDate(dates[i]);
            if (dateStr < startStr || dateStr > endStr) continue;

            let absAmount = baseAbs;
            if (!s.amount_is_fixed && s.amount_trend !== 0) {
                // Trend: on absolute values, positive trend = getting more expensive.
                // monthsOut must reflect actual calendar months between occurrences:
                //   weekly → 0.25 months/occurrence, biweekly → 0.5, monthly → 1, quarterly → 3
                const monthsOut = i * (
                    s.cadence === "weekly"    ? 0.25 :
                    s.cadence === "biweekly"  ? 0.5  :
                    s.cadence === "quarterly" ? 3    : 1
                );
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
        // Needs up to 6 iterations: worst case is last_occurrence at the 75-day staleness
        // boundary (2.5× monthly cadence), where months 1–2 fall in the past and months 3–5
        // are within the 90-day forecast window. The old cap of 4 caused month-5 to be
        // silently dropped from every forecast in this scenario.
        for (let m = 1; m <= 6; m++) {
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
        // Needs up to 4 iterations: worst case is last_occurrence at the 225-day staleness
        // boundary (2.5× quarterly cadence), where q=1 (+90d) and q=2 (+180d) are in the past
        // and q=3 (+270d) is the first occurrence within the forecast window. The old cap of
        // 2 caused this quarterly charge to disappear entirely from the forecast.
        for (let q = 1; q <= 4; q++) {
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
        if (!Array.isArray(p.typical_merchants) || p.typical_merchants.length === 0) continue;
        
        // BANK-STYLE APPROACH: Calculate total expected spending for this category
        const weeklyTotal = Math.abs(p.recent_avg_amount || p.avg_amount) * p.avg_weekly_count;
        const totalPeriodAmount = weeklyTotal * (totalDays / 7);
        
        if (totalPeriodAmount <= 5) continue; // Skip tiny amounts
        
        // Spread the total as synthetic transactions across the period
        // Use fewer, larger transactions instead of many tiny ones (more realistic)
        const avgTransactionSize = Math.abs(p.recent_avg_amount || p.avg_amount);
        const syntheticTxCount = Math.max(1, Math.min(
            Math.round(totalPeriodAmount / avgTransactionSize * 0.8), // Slightly fewer than historical count
            Math.round(totalDays / 2) // No more than every other day
        ));
        
        if (syntheticTxCount === 0) continue;
        
        const amountPerTx = totalPeriodAmount / syntheticTxCount;
        const isExpense = (p.recent_avg_amount || p.avg_amount) < 0;
        
        // Distribute across time using day-of-week weights and realistic spacing
        const chosenDays: number[] = [];
        const minGapDays = Math.max(1, Math.round(totalDays / (syntheticTxCount * 1.5))); // Prevent clustering
        
        for (let txNum = 0; txNum < syntheticTxCount; txNum++) {
            let attempts = 0;
            let dayOffset = -1;
            
            while (attempts < 50) {
                // Pick a day using weekly distribution
                const targetWeek = (txNum / syntheticTxCount) * (totalDays / 7);
                const weekStart = Math.floor(targetWeek * 7);
                const weekEnd = Math.min(totalDays - 1, weekStart + 6);
                
                // Use day-of-week weights within this week
                const dow = (() => {
                    const cumWeights = p.day_of_week_weights.reduce((acc, weight, i) => {
                        acc.push((acc[acc.length - 1] || 0) + weight);
                        return acc;
                    }, [] as number[]);
                    const r = rand() * cumWeights[cumWeights.length - 1];
                    return cumWeights.findIndex(cw => r <= cw);
                })();
                
                const targetDow = (weekStart % 7 + dow) % 7;
                let candidateDay = weekStart;
                while (candidateDay <= weekEnd && candidateDay % 7 !== targetDow) {
                    candidateDay++;
                }
                
                if (candidateDay > weekEnd) candidateDay = weekStart + dow; // Fallback
                
                // Check minimum gap from previous transactions
                const tooClose = chosenDays.some(prevDay => Math.abs(prevDay - candidateDay) < minGapDays);
                if (!tooClose && candidateDay < totalDays) {
                    dayOffset = candidateDay;
                    break;
                }
                
                attempts++;
            }
            
            // Fallback: just spread evenly if weighted selection fails
            if (dayOffset === -1) {
                dayOffset = Math.round((txNum / syntheticTxCount) * (totalDays - 1));
            }
            
            chosenDays.push(dayOffset);
        }
        
        // Generate synthetic transactions representing the category total
        for (let i = 0; i < chosenDays.length; i++) {
            const d = addDays(startDate, chosenDays[i]);
            const dateStr = formatDate(d);
            
            // Add some variation around the average amount
            const variance = Math.min(avgTransactionSize * 0.3, Math.abs(p.amount_std_dev || 0));
            const noise = (rand() - 0.5) * variance * 0.5;
            let amount = roundTo((isExpense ? -1 : 1) * (amountPerTx + noise), 2);
            
            // Ensure we maintain expense/income type
            if (isExpense && amount > 0) amount = -amount;
            if (!isExpense && amount < 0) amount = -amount;
            
            // Use actual merchants from history to maintain merchant coverage
            // Rotate through the typical merchants to spread the category total
            const merchantName = p.typical_merchants[i % p.typical_merchants.length];
            
            // Enhanced confidence scoring for discretionary patterns
            let discretionaryConfidence: "high" | "medium" | "low" = "low";
            if (p.avg_weekly_count >= 2 && (p.amount_std_dev / Math.abs(p.avg_amount)) < 0.3) {
                discretionaryConfidence = "medium"; // Regular patterns with low variance
            }
            if (p.avg_weekly_count >= 3 && (p.amount_std_dev / Math.abs(p.avg_amount)) < 0.2) {
                discretionaryConfidence = "high"; // Very regular patterns
            }
            // Essential categories get confidence boost
            if (p.category === "Groceries" || p.category === "Utilities") {
                discretionaryConfidence = discretionaryConfidence === "low" ? "medium" : "high";
            }
            
            results.push({
                date: dateStr,
                day_of_week: DAY_NAMES[d.getDay()],
                merchant: merchantName,
                amount,
                category: p.category,
                type: isExpense ? "expense" : "income",
                confidence_score: discretionaryConfidence,
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
    rawTransactions: Transaction[],
    referenceDate: Date = new Date()
): FinancialProfile {
    const today = referenceDate;
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
    const recurring = detectRecurringSeries(cleaned, today);
    const recurringExpenseMerchants = new Set(
        recurring.filter((r) => r.type === "expense").map((r) => r.merchant)
    );
    const discretionary = detectDiscretionaryPatterns(cleaned, recurringExpenseMerchants, today);
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
    rawTransactions: Transaction[],
    referenceDate: Date = new Date()
): Forecast {
    const today = referenceDate;
    const start = addDays(today, 1);
    const end = addDays(today, 90);
    const cleaned = cleanTransactions(rawTransactions);

    if (cleaned.length === 0) {
        return { forecast_period_days: 90, predicted_transactions: [] };
    }

    // Detect patterns
    const recurring = detectRecurringSeries(cleaned, today);
    
    // TEMPORARY LOGGING: What recurring series are detected?
    console.log('\n=== RECURRING SERIES DETECTED ===');
    const expenseRecurring = recurring.filter(r => r.type === "expense");
    console.log(`Total expense recurring series: ${expenseRecurring.length}`);
    for (const r of expenseRecurring.sort((a, b) => Math.abs(b.recent_amount) - Math.abs(a.recent_amount))) {
        console.log(`${r.merchant} (${r.category}): ${r.cadence}, $${Math.abs(r.recent_amount).toFixed(2)}, conf=${r.confidence}, count=${r.count}`);
    }
    console.log('=== END RECURRING SERIES ===\n');
    
    const recurringExpenseMerchants = new Set(
        recurring.filter((r) => r.type === "expense").map((r) => r.merchant)
    );
    const recurringIncomeMerchants = new Set(
        recurring.filter((r) => r.type === "income").map((r) => r.merchant)
    );
    const discretionary = detectDiscretionaryPatterns(cleaned, recurringExpenseMerchants, today);

    // Schedule deterministically
    const recurringTxs = scheduleRecurringItems(recurring, start, end);

    // Seed based on today's date for reproducible but varying forecasts
    const seed = parseInt(formatDate(today).replace(/-/g, ""), 10);
    const discretionaryTxs = scheduleDiscretionaryItems(discretionary, start, end, seed);

    // Project variable/irregular income (freelance, gig, hourly) that wasn't
    // detected as strictly recurring (different amounts or irregular cadence).
    const variableIncomeTxs = scheduleVariableIncome(cleaned, recurringIncomeMerchants, start, end, seed, today);
    const lumpyIncomeTxs = scheduleLumpyIncomeEvents(cleaned, recurringIncomeMerchants, start, end, today);

    // Compute historical monthly averages for calibration
    const monthlyAvg = calcMonthlyAverages(cleaned);
    const forecastMonths = 3; // 90-day window

    // ── Expense calibration: scale discretionary to match historical totals ──
    // The discretionary scheduler can over/under-project because it works
    // per-category. Calibrate total predicted expenses against historical averages.
    const recurringExpenseTotal = recurringTxs
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const discretionaryExpenseTotal = discretionaryTxs
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totalPredictedExpenses = recurringExpenseTotal + discretionaryExpenseTotal;

    // Target: historical monthly expenses × 3 months (90-day window)
    const targetTotalExpenses = monthlyAvg.total_expenses * forecastMonths;

    // TOP-DOWN calibration: scale ALL expenses (recurring + discretionary) to match
    // historical monthly totals. Bottom-up detection consistently misses bills,
    // so the total forecast needs to be pulled toward the historical average.
    if (targetTotalExpenses > 0 && totalPredictedExpenses > 0) {
        const expenseScale = clamp(targetTotalExpenses / totalPredictedExpenses, 0.4, 3.5);
        if (Math.abs(expenseScale - 1) > 0.03) {
            for (const tx of recurringTxs) {
                if (tx.amount < 0) tx.amount = roundTo(tx.amount * expenseScale, 2);
            }
            for (const tx of discretionaryTxs) {
                if (tx.amount < 0) tx.amount = roundTo(tx.amount * expenseScale, 2);
            }
        }
    }

    // ── Income calibration ────
    const recurringIncomeTotal = recurringTxs
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

    // Target: median monthly income × 3 months, with 10% conservative haircut
    const targetTotalIncome = monthlyAvg.total_income * forecastMonths * 0.9;
    const variableIncomeTarget = Math.max(0, targetTotalIncome - recurringIncomeTotal);

    // Combine variable + lumpy income
    let allVariableIncome = [...variableIncomeTxs, ...lumpyIncomeTxs];
    const totalVariableIncome = allVariableIncome.reduce((s, tx) => s + tx.amount, 0);

    if (totalVariableIncome > 0 && variableIncomeTarget > 0) {
        const scale = clamp(variableIncomeTarget / totalVariableIncome, 0.1, 2.0);
        if (Math.abs(scale - 1) > 0.05) {
            allVariableIncome = allVariableIncome.map(tx => ({
                ...tx,
                amount: roundTo(tx.amount * scale, 2),
            }));
        }
    }

    // Merge and sort
    const all = [...recurringTxs, ...discretionaryTxs, ...allVariableIncome]
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
export function validateForecast(raw: Forecast, referenceDate: Date = new Date()): Forecast {
    const today = referenceDate;
    const tomorrow = formatDate(addDays(today, 1));
    const maxDate = formatDate(addDays(today, 91));

    const validated = raw.predicted_transactions
        .filter((tx) => typeof tx.date === "string" && isValidDateString(tx.date))
        .filter((tx) => tx.date >= tomorrow && tx.date <= maxDate)
        .filter(
            (tx) =>
                tx.date &&
                typeof tx.merchant === "string" &&
                typeof tx.amount === "number" &&
                Number.isFinite(tx.amount) &&
                tx.amount !== 0
        )
        .map((tx) => ({
            ...tx,
            merchant: sanitizeMerchantName(tx.merchant),
            category: tx.category?.trim() || "Other",
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
