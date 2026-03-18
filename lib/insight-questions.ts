/**
 * Insight Questions Engine
 * 
 * Analyzes transaction history to generate data-driven questions that
 * dramatically improve forecast accuracy. Instead of guessing about
 * regime changes, income patterns, and spending spikes — we just ask.
 * 
 * Two layers:
 *  Layer 1: General onboarding (pre-data or minimal data)
 *  Layer 2: Data-driven (after analyzing transactions)
 */

import type { Transaction } from "@/types";

// ─── Types ──────────────────────────────────────────────────

export interface InsightQuestion {
    id: string;
    layer: "onboarding" | "data-driven";
    priority: number; // 1 = highest
    category: "income" | "expense" | "regime_change" | "spike" | "recurring" | "general";
    question: string;
    options: InsightOption[];
    context?: string; // Shown as subtext (e.g., "Your spending jumped from $1K to $3K/mo")
    metadata?: Record<string, unknown>; // For storing relevant transaction IDs, amounts, etc.
}

export interface InsightOption {
    label: string;
    value: string; // Machine-readable value stored in answer
}

export interface InsightAnswer {
    question_id: string;
    value: string;
    answered_at: string; // ISO timestamp
}

export interface InsightProfile {
    /** User's stated monthly income expectation */
    expected_monthly_income?: number;
    /** Income type: salary (stable), freelance (variable), mixed */
    income_type?: "salary" | "freelance" | "mixed";
    /** Did user confirm a recent spending regime change? */
    regime_change_confirmed?: boolean;
    /** Which months to anchor spending to (e.g., "recent" = last 3 months) */
    spending_anchor?: "recent" | "historical" | "custom";
    /** User-specified monthly spending estimate */
    expected_monthly_expenses?: number;
    /** Merchants user confirmed as one-time (not recurring) */
    one_time_merchants?: string[];
    /** Merchants user confirmed as recurring */
    confirmed_recurring?: string[];
    /** Custom notes from free-text answers */
    notes?: string[];
    /** Life situation — temporal income pattern */
    life_situation?: "student_aid" | "student_no_aid" | "seasonal_worker" | "none";
    /** Detected calendar months with expected large income (disbursements, bonuses) */
    high_income_months?: number[];
    /** Expected large income amount for high-income months */
    high_income_amount?: number;
    /** User-stated upcoming large income amount (from "yes_large" answer) */
    upcoming_large_income?: number;
    /** User said "maybe" to upcoming large income */
    upcoming_large_income_likely?: boolean;
    /** User confirmed recurring high-income months pattern */
    recurring_high_income_confirmed?: boolean;
    /** User's birth month (1-12) — affects spending and gift income patterns */
    birth_month?: number;
    /** User confirmed some months were atypical — engine should down-weight outliers */
    has_atypical_months?: boolean;
    /** Specific months flagged as atypical (YYYY-MM format) */
    atypical_month_list?: string[];
    /** User-stated upcoming large expense amount */
    upcoming_large_expense?: number;
    /** Annual event type (tuition, holiday_travel, annual_renewals) */
    annual_events?: string;
}

// ─── Analysis Helpers ───────────────────────────────────────

interface MonthlyTotals {
    month: string; // YYYY-MM
    income: number;
    expenses: number;
    txCount: number;
}

function getMonthlyTotals(transactions: Transaction[]): MonthlyTotals[] {
    const byMonth = new Map<string, { income: number; expenses: number; count: number }>();

    for (const tx of transactions) {
        if (tx.pending || typeof tx.amount !== "number" || tx.amount === 0) continue;
        const month = tx.date.substring(0, 7);
        if (!byMonth.has(month)) byMonth.set(month, { income: 0, expenses: 0, count: 0 });
        const m = byMonth.get(month)!;
        m.count++;
        // Plaid: positive = expense, negative = income
        if (tx.amount < 0) {
            m.income += Math.abs(tx.amount);
        } else {
            m.expenses += tx.amount;
        }
    }

    return [...byMonth.entries()]
        .map(([month, data]) => ({ month, income: data.income, expenses: data.expenses, txCount: data.count }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ─── Detectors ──────────────────────────────────────────────

// ─── Temporal / Life-Situation Detectors ────────────────────

/** Patterns that indicate student status */
const STUDENT_PATTERNS = [
    /tuition/i, /university/i, /\bcollege\b/i, /\busc\b/i, /campus/i,
    /financial\s*aid/i, /student/i, /bursar/i, /\bfafsa\b/i,
    /dormitory/i, /dorm\b/i, /textbook/i, /bookstore/i,
];

/**
 * Detect if the user is likely a student based on transaction merchants.
 * If student-like transactions are found, generate a life-situation question.
 */
function detectLifeSituation(transactions: Transaction[], monthly: MonthlyTotals[]): InsightQuestion | null {
    if (transactions.length < 20 || monthly.length < 6) return null;

    // Check for student signals in merchant names
    let studentSignals = 0;
    const studentMerchants = new Set<string>();
    for (const tx of transactions) {
        const name = `${tx.merchant_name || ""} ${tx.name || ""}`;
        for (const pattern of STUDENT_PATTERNS) {
            if (pattern.test(name)) {
                studentSignals++;
                studentMerchants.add(
                    (tx.merchant_name || tx.name || "").substring(0, 30)
                );
                break;
            }
        }
    }

    // Also check for large deposits in academic calendar months (Jan, May, Aug)
    const acadMonths = [1, 5, 8];
    let acadSpikes = 0;
    const incomes = monthly.map(m => m.income);
    const medIncome = median(incomes);
    for (const m of monthly) {
        const calMonth = parseInt(m.month.substring(5, 7));
        if (acadMonths.includes(calMonth) && m.income > medIncome * 3) {
            acadSpikes++;
        }
    }

    // Need at least 2 student signals OR (1 signal + academic spikes)
    if (studentSignals < 2 && !(studentSignals >= 1 && acadSpikes >= 1)) {
        return null;
    }

    const merchantList = [...studentMerchants].slice(0, 3).join(", ");

    return {
        id: "life_situation",
        layer: "data-driven",
        priority: 1, // High priority — huge accuracy impact
        category: "income",
        question: "Are you currently a student?",
        context: studentMerchants.size > 0
            ? `We noticed transactions at: ${merchantList}`
            : undefined,
        options: [
            { label: "Yes, I receive financial aid / scholarships", value: "student_aid" },
            { label: "Yes, but I don't receive financial aid", value: "student_no_aid" },
            { label: "No, I'm not a student", value: "not_student" },
        ],
        metadata: { studentSignals, acadSpikes, studentMerchants: [...studentMerchants] },
    };
}

/**
 * Detect which calendar months historically have large income spikes.
 * Used to build the high_income_months profile field.
 */
function detectHighIncomeMonths(monthly: MonthlyTotals[]): number[] {
    if (monthly.length < 6) return [];

    const incomes = monthly.map(m => m.income);
    const medIncome = median(incomes);
    const threshold = medIncome * 3; // 3x median = "spike"

    // Group spikes by calendar month
    const spikeMonths = new Map<number, number[]>();
    for (const m of monthly) {
        if (m.income > threshold) {
            const calMonth = parseInt(m.month.substring(5, 7));
            if (!spikeMonths.has(calMonth)) spikeMonths.set(calMonth, []);
            spikeMonths.get(calMonth)!.push(m.income);
        }
    }

    // Return calendar months that had spikes
    return [...spikeMonths.keys()].sort((a, b) => a - b);
}

/**
 * Ask the user about upcoming large income in the next 3 months.
 * This is the single biggest lever for income accuracy — spike months
 * (May $8K, Aug $6K, Jan $10K) are impossible to predict statistically
 * but easy for the user to anticipate.
 */
function detectUpcomingLargeIncome(monthly: MonthlyTotals[]): InsightQuestion | null {
    if (monthly.length < 4) return null;

    const incomes = monthly.map(m => m.income).filter(i => i > 0);
    if (incomes.length < 4) return null;

    const medIncome = median(incomes);

    // Only ask if income is variable enough to have spikes
    const maxIncome = Math.max(...incomes);
    if (maxIncome < medIncome * 2.5) return null; // No significant spikes in history

    // Build the next 3 month names for the question context
    const now = new Date();
    const nextMonths = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
        return d.toLocaleString("en-US", { month: "long" });
    });

    return {
        id: "upcoming_large_income",
        layer: "data-driven",
        priority: 1,
        category: "income",
        question: `Do you expect any large payments or deposits in the next few months (${nextMonths.join(", ")})?`,
        context: `Your income varies a lot — some months you receive $${Math.round(maxIncome).toLocaleString()}+`,
        options: [
            { label: "Yes, I expect a large payment (over $1,000)", value: "yes_large" },
            { label: "Maybe — I sometimes get large deposits", value: "maybe" },
            { label: "No, just my regular income", value: "no" },
        ],
        metadata: { medianIncome: medIncome, maxIncome },
    };
}

/**
 * If user says they expect large income, ask for specifics.
 * This is a follow-up question triggered by upcoming_large_income = "yes_large".
 */
function detectLargeIncomeDetails(monthly: MonthlyTotals[], existingAnswers: InsightAnswer[]): InsightQuestion | null {
    const upcomingAnswer = existingAnswers.find(a => a.question_id === "upcoming_large_income");
    if (!upcomingAnswer || upcomingAnswer.value !== "yes_large") return null;

    // Build amount brackets based on historical spikes
    const incomes = monthly.map(m => m.income).filter(i => i > 0);
    const spikes = incomes.filter(i => i > median(incomes) * 2);
    const medSpike = spikes.length > 0 ? median(spikes) : 5000;

    const round500 = (n: number) => Math.round(n / 500) * 500 || 500;

    return {
        id: "large_income_amount",
        layer: "data-driven",
        priority: 1,
        category: "income",
        question: "Roughly how much do you expect to receive?",
        context: "This helps us forecast your cash flow more accurately",
        options: [
            { label: `$1,000 – $3,000`, value: "2000" },
            { label: `$3,000 – $5,000`, value: "4000" },
            { label: `$5,000 – $8,000`, value: "6500" },
            { label: `$8,000 – $12,000`, value: "10000" },
            { label: `More than $12,000`, value: "15000" },
        ],
        metadata: { medianSpike: medSpike },
    };
}

/**
 * Detect recurring high-income months from the data and ask user to confirm.
 * E.g., "We noticed January and May tend to have big deposits. Is that expected going forward?"
 */
function detectRecurringHighIncomeMonths(monthly: MonthlyTotals[]): InsightQuestion | null {
    const highMonths = detectHighIncomeMonths(monthly);
    if (highMonths.length === 0) return null;

    const monthNames = highMonths.map(m =>
        new Date(2025, m - 1, 1).toLocaleString("en-US", { month: "long" })
    );

    // Calculate median spike amount
    const incomes = monthly.map(m => m.income);
    const medIncome = median(incomes);
    const spikeTotals = monthly
        .filter(m => highMonths.includes(parseInt(m.month.substring(5, 7))) && m.income > medIncome * 2)
        .map(m => m.income);
    const medSpike = spikeTotals.length > 0 ? median(spikeTotals) : 0;

    return {
        id: "recurring_high_income_months",
        layer: "data-driven",
        priority: 1,
        category: "income",
        question: `${monthNames.join(" and ")} tend to be your biggest income months. Will that continue?`,
        context: `These months typically bring in ~$${Math.round(medSpike).toLocaleString()}`,
        options: [
            { label: "Yes, I expect big income in those months", value: "yes" },
            { label: "Probably, but the amounts vary", value: "likely" },
            { label: "Not anymore — my situation changed", value: "no" },
        ],
        metadata: { highMonths, medianSpike: medSpike },
    };
}

/**
 * Detect months that look atypical and ask the user to confirm.
 * If the user flags a month as unusual, the engine can exclude or
 * down-weight it in historical averages — stopping the model from
 * training on noise.
 */
function detectAtypicalMonths(monthly: MonthlyTotals[]): InsightQuestion | null {
    if (monthly.length < 6) return null;

    const expenses = monthly.map(m => m.expenses);
    const incomes = monthly.map(m => m.income);
    const medExp = median(expenses);
    const medInc = median(incomes.filter(i => i > 0));

    // Find months that are outliers on EITHER income or expenses
    const outliers: { month: string; reason: string }[] = [];
    for (const m of monthly) {
        const calMonth = parseInt(m.month.substring(5, 7));
        const monthName = new Date(2025, calMonth - 1, 1).toLocaleString("en-US", { month: "short" });
        const year = m.month.substring(0, 4);
        const label = `${monthName} ${year}`;

        if (m.expenses > medExp * 2) {
            outliers.push({ month: m.month, reason: `${label}: unusually high spending ($${Math.round(m.expenses).toLocaleString()})` });
        }
        if (m.income > medInc * 4 && medInc > 0) {
            outliers.push({ month: m.month, reason: `${label}: unusually high income ($${Math.round(m.income).toLocaleString()})` });
        }
        if (m.income < medInc * 0.1 && medInc > 100) {
            outliers.push({ month: m.month, reason: `${label}: almost no income ($${Math.round(m.income)})` });
        }
    }

    if (outliers.length === 0) return null;

    // Show the top 3 most unusual months
    const topOutliers = outliers.slice(0, 3);

    return {
        id: "atypical_months",
        layer: "data-driven",
        priority: 2,
        category: "general",
        question: "Were any of these months unusual or one-time situations?",
        context: topOutliers.map(o => o.reason).join("\n"),
        options: [
            { label: "Yes, some of those were one-off situations", value: "some_atypical" },
            { label: "Yes, all of those were unusual", value: "all_atypical" },
            { label: "No, that's pretty normal for me", value: "normal" },
        ],
        metadata: {
            outlierMonths: outliers.map(o => o.month),
            reasons: outliers.map(o => o.reason),
        },
    };
}

/**
 * Ask for the user's birth month — predictable annual pattern of
 * gift income and celebratory spending.
 */
function detectBirthMonth(): InsightQuestion {
    return {
        id: "birth_month",
        layer: "onboarding",
        priority: 3,
        category: "general",
        question: "What month is your birthday?",
        context: "Birthday months often have different spending and gift patterns",
        options: [
            { label: "January", value: "1" },
            { label: "February", value: "2" },
            { label: "March", value: "3" },
            { label: "April", value: "4" },
            { label: "May", value: "5" },
            { label: "June", value: "6" },
            { label: "July", value: "7" },
            { label: "August", value: "8" },
            { label: "September", value: "9" },
            { label: "October", value: "10" },
            { label: "November", value: "11" },
            { label: "December", value: "12" },
        ],
    };
}

/**
 * Ask about upcoming large expenses — mirrors the large income question.
 * Helps predict expense spikes (moving, car, tuition, vacation, etc.)
 */
function detectUpcomingLargeExpenses(monthly: MonthlyTotals[]): InsightQuestion | null {
    if (monthly.length < 3) return null;

    const expenses = monthly.map(m => m.expenses);
    const maxExp = Math.max(...expenses);
    const medExp = median(expenses);

    // Only ask if there are historical expense spikes
    if (maxExp < medExp * 1.5) return null;

    const now = new Date();
    const nextMonths = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
        return d.toLocaleString("en-US", { month: "long" });
    });

    return {
        id: "upcoming_large_expenses",
        layer: "data-driven",
        priority: 2,
        category: "expense",
        question: `Any big expenses coming up in ${nextMonths.join(", ")}?`,
        context: "Things like tuition, car repairs, moving, vacations, etc.",
        options: [
            { label: "Yes, something over $1,000", value: "yes_large" },
            { label: "Maybe — I'm not sure yet", value: "maybe" },
            { label: "No, just normal spending", value: "no" },
        ],
        metadata: { medianExpense: medExp, maxExpense: maxExp },
    };
}

/**
 * Follow-up for upcoming large expense amount.
 */
function detectLargeExpenseDetails(existingAnswers: InsightAnswer[]): InsightQuestion | null {
    const upcomingAnswer = existingAnswers.find(a => a.question_id === "upcoming_large_expenses");
    if (!upcomingAnswer || upcomingAnswer.value !== "yes_large") return null;

    return {
        id: "large_expense_amount",
        layer: "data-driven",
        priority: 2,
        category: "expense",
        question: "Roughly how much will the big expense be?",
        options: [
            { label: "$1,000 – $2,000", value: "1500" },
            { label: "$2,000 – $5,000", value: "3500" },
            { label: "$5,000 – $10,000", value: "7500" },
            { label: "More than $10,000", value: "12000" },
        ],
    };
}

/**
 * Ask about annual recurring events that affect finances.
 * These are predictable calendar-based expenses the model should know about.
 */
function detectAnnualEvents(): InsightQuestion {
    return {
        id: "annual_events",
        layer: "onboarding",
        priority: 3,
        category: "expense",
        question: "Do any of these apply to you?",
        context: "Annual events that affect your finances",
        options: [
            { label: "I pay tuition / education costs", value: "tuition" },
            { label: "I travel for holidays (Nov–Dec)", value: "holiday_travel" },
            { label: "I have annual insurance or subscription renewals", value: "annual_renewals" },
            { label: "None of these apply", value: "none" },
        ],
    };
}

function detectRegimeChange(monthly: MonthlyTotals[]): InsightQuestion | null {
    if (monthly.length < 4) return null;

    // Compare first half vs second half of expense history
    const mid = Math.floor(monthly.length / 2);
    const firstHalf = monthly.slice(0, mid).map(m => m.expenses);
    const secondHalf = monthly.slice(mid).map(m => m.expenses);

    const firstMedian = median(firstHalf);
    const secondMedian = median(secondHalf);

    // Significant change = >40% shift
    if (firstMedian === 0) return null;
    const changeRatio = secondMedian / firstMedian;
    if (changeRatio < 1.4 && changeRatio > 0.6) return null;

    const direction = changeRatio > 1 ? "increased" : "decreased";
    const firstStr = `$${Math.round(firstMedian).toLocaleString()}`;
    const secondStr = `$${Math.round(secondMedian).toLocaleString()}`;

    return {
        id: "regime_change_expenses",
        layer: "data-driven",
        priority: 1,
        category: "regime_change",
        question: `Your monthly spending ${direction} from ~${firstStr} to ~${secondStr}. What changed?`,
        context: `Earlier months averaged ${firstStr}/mo, recent months average ${secondStr}/mo`,
        options: [
            { label: "Moved / new rent or mortgage", value: "housing_change" },
            { label: "New car / car payment", value: "auto_change" },
            { label: "Lifestyle change (more/less spending)", value: "lifestyle_change" },
            { label: "Temporary spike (will go back to normal)", value: "temporary" },
            { label: "This is my new normal", value: "new_normal" },
        ],
        metadata: { firstMedian, secondMedian, changeRatio },
    };
}

function detectIncomePattern(monthly: MonthlyTotals[]): InsightQuestion | null {
    if (monthly.length < 3) return null;

    const incomes = monthly.map(m => m.income).filter(i => i > 0);
    if (incomes.length < 3) return null;

    const med = median(incomes);
    const coeffOfVariation = Math.sqrt(
        incomes.reduce((sum, i) => sum + Math.pow(i - med, 2), 0) / incomes.length
    ) / med;

    // High variability = CV > 0.3
    const isVariable = coeffOfVariation > 0.3;

    const medStr = `$${Math.round(med).toLocaleString()}`;
    const minStr = `$${Math.round(Math.min(...incomes)).toLocaleString()}`;
    const maxStr = `$${Math.round(Math.max(...incomes)).toLocaleString()}`;

    if (isVariable) {
        return {
            id: "income_pattern",
            layer: "data-driven",
            priority: 1,
            category: "income",
            question: "Your income varies a lot. What best describes your situation?",
            context: `Monthly income ranged from ${minStr} to ${maxStr} (median ${medStr})`,
            options: [
                { label: "Freelance / gig work — varies month to month", value: "freelance" },
                { label: "Salary + side income (side income varies)", value: "mixed" },
                { label: "Recently changed jobs (income is stabilizing)", value: "job_change" },
                { label: "Seasonal work — some months are slow", value: "seasonal" },
            ],
            metadata: { median: med, min: Math.min(...incomes), max: Math.max(...incomes), coeffOfVariation },
        };
    }

    return null; // Stable income — no question needed
}

function detectIncomeExpectation(monthly: MonthlyTotals[]): InsightQuestion {
    const incomes = monthly.map(m => m.income).filter(i => i > 0);
    const med = incomes.length > 0 ? median(incomes) : 0;

    // Generate sensible bracket options around the median
    const brackets = generateBrackets(med);

    return {
        id: "income_expectation",
        layer: "data-driven",
        priority: 2,
        category: "income",
        question: "What do you expect to earn per month going forward?",
        context: incomes.length > 0
            ? `Based on your history, your median monthly income is ~$${Math.round(med).toLocaleString()}`
            : undefined,
        options: brackets.map(b => ({ label: b.label, value: String(b.value) })),
    };
}

function generateBrackets(median: number): { label: string; value: number }[] {
    if (median <= 0) {
        return [
            { label: "Less than $2,000/mo", value: 1500 },
            { label: "$2,000 – $4,000/mo", value: 3000 },
            { label: "$4,000 – $7,000/mo", value: 5500 },
            { label: "$7,000 – $10,000/mo", value: 8500 },
            { label: "More than $10,000/mo", value: 12000 },
        ];
    }

    const round = (n: number) => Math.round(n / 500) * 500 || 500;
    const low = round(median * 0.5);
    const midLow = round(median * 0.8);
    const mid = round(median);
    const midHigh = round(median * 1.3);
    const high = round(median * 1.8);

    return [
        { label: `Around $${low.toLocaleString()}/mo or less`, value: low },
        { label: `Around $${midLow.toLocaleString()}/mo`, value: midLow },
        { label: `Around $${mid.toLocaleString()}/mo (matches history)`, value: mid },
        { label: `Around $${midHigh.toLocaleString()}/mo`, value: midHigh },
        { label: `$${high.toLocaleString()}/mo or more`, value: high },
    ];
}

function detectSpendingSpikes(transactions: Transaction[], monthly: MonthlyTotals[]): InsightQuestion | null {
    if (transactions.length < 20) return null;

    // Find individual large transactions (>3x median transaction size)
    const amounts = transactions
        .filter(tx => !tx.pending && tx.amount > 0) // expenses in Plaid convention
        .map(tx => tx.amount);

    if (amounts.length < 10) return null;

    const medianAmount = median(amounts);
    const threshold = Math.max(medianAmount * 5, 200); // At least $200 or 5x median

    // Filter out obvious income/deposits from spike detection
    const incomePatterns = /deposit|payroll|direct\s*dep|salary|transfer|refund|credit|interest/i;
    const spikes = transactions
        .filter(tx => !tx.pending && tx.amount > threshold)
        .filter(tx => !incomePatterns.test(tx.name) && !incomePatterns.test(tx.merchant_name || ""))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3); // Top 3 biggest

    if (spikes.length === 0) return null;

    const biggest = spikes[0];
    const merchantName = biggest.merchant_name || biggest.name;
    const amountStr = `$${biggest.amount.toFixed(0)}`;

    return {
        id: `spike_${biggest.transaction_id}`,
        layer: "data-driven",
        priority: 2,
        category: "spike",
        question: `You had a large charge of ${amountStr} at ${merchantName}. Is this a one-time expense?`,
        context: `On ${biggest.date}`,
        options: [
            { label: "Yes, one-time purchase", value: "one_time" },
            { label: "No, this happens regularly", value: "recurring" },
            { label: "It might happen again (not sure)", value: "maybe" },
        ],
        metadata: { transaction_id: biggest.transaction_id, merchant: merchantName, amount: biggest.amount },
    };
}

function detectExpenseExpectation(monthly: MonthlyTotals[]): InsightQuestion | null {
    if (monthly.length < 2) return null;

    // Use last 3 months as baseline
    const recent = monthly.slice(-3).map(m => m.expenses);
    const recentAvg = mean(recent);

    if (recentAvg <= 0) return null;

    const brackets = generateBrackets(recentAvg);

    return {
        id: "expense_expectation",
        layer: "data-driven",
        priority: 3,
        category: "expense",
        question: "What do you expect to spend per month going forward?",
        context: `Your recent spending averages ~$${Math.round(recentAvg).toLocaleString()}/mo`,
        options: brackets.map(b => ({ label: b.label, value: String(b.value) })),
    };
}

function getOnboardingQuestions(): InsightQuestion[] {
    return [
        {
            id: "income_type",
            layer: "onboarding",
            priority: 1,
            category: "income",
            question: "How would you describe your income?",
            options: [
                { label: "Steady salary / paycheck", value: "salary" },
                { label: "Freelance / gig / contract work", value: "freelance" },
                { label: "Mix of salary + side income", value: "mixed" },
                { label: "Irregular / unpredictable", value: "irregular" },
            ],
        },
        {
            id: "recent_changes",
            layer: "onboarding",
            priority: 2,
            category: "general",
            question: "Have your finances changed recently?",
            options: [
                { label: "No, things are pretty stable", value: "stable" },
                { label: "Yes, I'm spending more than before", value: "spending_up" },
                { label: "Yes, I'm spending less than before", value: "spending_down" },
                { label: "Yes, my income changed", value: "income_changed" },
            ],
        },
        detectBirthMonth(),
        detectAnnualEvents(),
    ];
}

// ─── Main API ───────────────────────────────────────────────

/**
 * Generate insight questions from transaction history.
 * Returns 3-5 prioritized questions (never more than 5).
 */
export function generateInsightQuestions(
    transactions: Transaction[],
    existingAnswers?: InsightAnswer[]
): InsightQuestion[] {
    const answeredIds = new Set((existingAnswers || []).map(a => a.question_id));

    const monthly = getMonthlyTotals(transactions);
    const questions: InsightQuestion[] = [];

    // Layer 1: Onboarding questions (if not answered yet)
    if (transactions.length === 0) {
        return getOnboardingQuestions().filter(q => !answeredIds.has(q.id));
    }

    // Layer 2: Data-driven questions

    // Life situation (student detection) — highest priority, huge accuracy impact
    const lifeSituation = detectLifeSituation(transactions, monthly);
    if (lifeSituation && !answeredIds.has(lifeSituation.id)) questions.push(lifeSituation);

    // Upcoming large income — biggest single lever for income accuracy
    const upcomingIncome = detectUpcomingLargeIncome(monthly);
    if (upcomingIncome && !answeredIds.has(upcomingIncome.id)) questions.push(upcomingIncome);

    // Follow-up: how much? (only if they said "yes_large")
    const largeIncomeDetails = detectLargeIncomeDetails(monthly, existingAnswers || []);
    if (largeIncomeDetails && !answeredIds.has(largeIncomeDetails.id)) questions.push(largeIncomeDetails);

    // Recurring high-income months
    const recurringHigh = detectRecurringHighIncomeMonths(monthly);
    if (recurringHigh && !answeredIds.has(recurringHigh.id)) questions.push(recurringHigh);

    // Atypical months — helps model ignore outlier data
    const atypical = detectAtypicalMonths(monthly);
    if (atypical && !answeredIds.has(atypical.id)) questions.push(atypical);

    // Upcoming large expenses — mirrors income question
    const upcomingExpenses = detectUpcomingLargeExpenses(monthly);
    if (upcomingExpenses && !answeredIds.has(upcomingExpenses.id)) questions.push(upcomingExpenses);

    // Follow-up: how much? (only if they said "yes_large")
    const largeExpDetails = detectLargeExpenseDetails(existingAnswers || []);
    if (largeExpDetails && !answeredIds.has(largeExpDetails.id)) questions.push(largeExpDetails);

    const regimeChange = detectRegimeChange(monthly);
    if (regimeChange && !answeredIds.has(regimeChange.id)) questions.push(regimeChange);

    const incomePattern = detectIncomePattern(monthly);
    if (incomePattern && !answeredIds.has(incomePattern.id)) questions.push(incomePattern);

    const incomeExpectation = detectIncomeExpectation(monthly);
    if (!answeredIds.has(incomeExpectation.id)) questions.push(incomeExpectation);

    const spike = detectSpendingSpikes(transactions, monthly);
    if (spike && !answeredIds.has(spike.id)) questions.push(spike);

    const expenseExpectation = detectExpenseExpectation(monthly);
    if (expenseExpectation && !answeredIds.has(expenseExpectation.id)) questions.push(expenseExpectation);

    // Add onboarding questions only if the data-driven equivalents didn't fire
    const hasIncomeQ = questions.some(q => q.category === "income");
    for (const q of getOnboardingQuestions()) {
        if (answeredIds.has(q.id)) continue;
        // Skip "income_type" if we already have a data-driven income question
        if (q.id === "income_type" && hasIncomeQ) continue;
        questions.push(q);
    }

    // Sort by priority, take top 5
    questions.sort((a, b) => a.priority - b.priority);
    return questions.slice(0, 5);
}

/**
 * Convert user's insight answers into an InsightProfile
 * that the forecast engine and Gemini can use.
 */
export function buildInsightProfile(answers: InsightAnswer[]): InsightProfile {
    const profile: InsightProfile = {};
    const byId = new Map(answers.map(a => [a.question_id, a.value]));

    // Birth month
    const birthMonth = byId.get("birth_month");
    if (birthMonth) profile.birth_month = parseInt(birthMonth);

    // Atypical months — need to extract outlier months from the answers
    const atypical = byId.get("atypical_months");
    if (atypical === "some_atypical" || atypical === "all_atypical") {
        profile.has_atypical_months = true;
        // The outlier months were detected during question generation.
        // In the real app, the question metadata has the months — here
        // we mark the flag so the engine can auto-detect and exclude them.
    }

    // Upcoming large expenses
    const upcomingExp = byId.get("upcoming_large_expenses");
    const largeExpAmt = byId.get("large_expense_amount");
    if (upcomingExp === "yes_large" && largeExpAmt) {
        profile.upcoming_large_expense = parseFloat(largeExpAmt);
    }

    // Annual events
    const annualEvents = byId.get("annual_events");
    if (annualEvents && annualEvents !== "none") {
        profile.annual_events = annualEvents;
    }

    // Upcoming large income
    const upcomingInc = byId.get("upcoming_large_income");
    const largeIncAmt = byId.get("large_income_amount");
    if (upcomingInc === "yes_large" && largeIncAmt) {
        profile.upcoming_large_income = parseFloat(largeIncAmt);
    } else if (upcomingInc === "maybe") {
        // "Maybe" — use a conservative estimate based on historical spikes
        profile.upcoming_large_income_likely = true;
    }

    // Recurring high-income months
    const recurringHigh = byId.get("recurring_high_income_months");
    if (recurringHigh === "yes" || recurringHigh === "likely") {
        // The high_income_months were detected during question generation
        // and stored in metadata. We'll populate from transaction analysis.
        profile.recurring_high_income_confirmed = true;
    }

    // Life situation (student / temporal pattern)
    const lifeSit = byId.get("life_situation");
    if (lifeSit === "student_aid") {
        profile.life_situation = "student_aid";
        profile.income_type = "freelance"; // Student income is inherently variable
    } else if (lifeSit === "student_no_aid") {
        profile.life_situation = "student_no_aid";
    } else if (lifeSit === "not_student") {
        profile.life_situation = "none";
    }

    // Income type
    const incomeType = byId.get("income_type") || byId.get("income_pattern");
    if (incomeType === "salary") profile.income_type = "salary";
    else if (incomeType === "freelance" || incomeType === "irregular" || incomeType === "seasonal") profile.income_type = "freelance";
    else if (incomeType === "mixed" || incomeType === "job_change") profile.income_type = "mixed";

    // Income expectation
    const incomeExp = byId.get("income_expectation");
    if (incomeExp) profile.expected_monthly_income = parseFloat(incomeExp);

    // Expense expectation
    const expenseExp = byId.get("expense_expectation");
    if (expenseExp) profile.expected_monthly_expenses = parseFloat(expenseExp);

    // Regime change
    const regime = byId.get("regime_change_expenses");
    if (regime === "new_normal" || regime === "lifestyle_change" || regime === "housing_change" || regime === "auto_change") {
        profile.regime_change_confirmed = true;
        profile.spending_anchor = "recent";
    } else if (regime === "temporary") {
        profile.regime_change_confirmed = false;
        profile.spending_anchor = "historical";
    }

    // Recent changes (onboarding)
    const recentChanges = byId.get("recent_changes");
    if (recentChanges === "spending_up" || recentChanges === "spending_down" || recentChanges === "income_changed") {
        profile.spending_anchor = "recent";
    } else if (recentChanges === "stable") {
        profile.spending_anchor = "historical";
    }

    // Spike handling
    const spikeAnswers = answers.filter(a => a.question_id.startsWith("spike_"));
    profile.one_time_merchants = [];
    profile.confirmed_recurring = [];
    for (const a of spikeAnswers) {
        // We'd need the metadata to get merchant names — for now store question IDs
        if (a.value === "one_time") {
            // Will be matched back via metadata when applying
        } else if (a.value === "recurring") {
            // Confirmed recurring
        }
    }

    return profile;
}
