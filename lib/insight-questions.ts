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
