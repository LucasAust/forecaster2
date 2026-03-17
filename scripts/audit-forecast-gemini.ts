import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { geminiClient } from "../lib/gemini";
import { generateDeterministicForecast, validateForecast } from "../lib/forecast-engine";
import { inferCategory } from "../lib/categories";
import { cleanMerchantName } from "../lib/merchants";
import type { Forecast, Transaction } from "../types";

type MonthlyMetrics = {
    month: string;
    historyTxCount: number;
    predictedIncome: number;
    actualIncome: number;
    predictedExpenses: number;
    actualExpenses: number;
    predictedNet: number;
    actualNet: number;
    expenseAbsErrPct: number;
    incomeAbsErrPct: number;
    netAbsErr: number;
    merchantCoveragePct: number;
    expenseErrDriftPct: number | null;
    incomeErrDriftPct: number | null;
    largestIncomeCredit: number;
    isShockMonth: boolean;
    forecastMethod: "deterministic" | "gemini-enhanced";
};

type IncomeSource = "payroll" | "interest" | "cashout" | "check_deposit" | "refund" | "transfer_like" | "other";

export type GeminiAuditSummary = {
    rows: MonthlyMetrics[];
    avgExpenseErr: number;
    avgIncomeErr: number;
    avgNetAbsErr: number;
    avgCoverage: number;
    deterministicAvgExpenseErr: number;
    deterministicAvgIncomeErr: number;
    geminiAvgExpenseErr: number;
    geminiAvgIncomeErr: number;
    geminiSuccessRate: number;
    improvementCount: number;
    degradationCount: number;
    shockIncomeCreditThreshold: number;
};

function getEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function classifyIncomeSource(merchant: string, category: string): IncomeSource {
    const merchantLc = merchant.toLowerCase();
    const categoryLc = category.toLowerCase();
    if (/payroll|salary|wage|direct\s*deposit|direct\s*dep|adp|gusto|paychex|workday|rippling|ukg|ceridian|bamboohr|paycom/.test(merchantLc)) return "payroll";
    if (/interest\s*payment|interest\s*paid|interest\s*credit/.test(merchantLc)) return "interest";
    if (/venmo\s*income|cashout|cash\s*out/.test(merchantLc)) return "cashout";
    if (/check\s*deposit|remote\s*online\s*deposit|deposit\s+id\s+number|\bid\s*number\b/.test(merchantLc)) return "check_deposit";
    if (/refund|reimb|reimbursement|treasury|irs/.test(merchantLc)) return "refund";
    if (categoryLc === "transfer" || /transfer|xfer|zelle|paypal|cash\s*app/.test(merchantLc)) return "transfer_like";
    return "other";
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuote = !inQuote;
            continue;
        }
        if (char === "," && !inQuote) {
            out.push(current.trim());
            current = "";
            continue;
        }
        current += char;
    }
    out.push(current.trim());
    return out;
}

function toISODate(mmddyyyy: string): string | null {
    const match = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    return `${match[3]}-${match[1]}-${match[2]}`;
}

function parseChase7885(filePath: string): Transaction[] {
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").slice(1);
    const txs: Transaction[] = [];

    lines.forEach((line, index) => {
        const cols = parseCsvLine(line);
        if (cols.length < 6) return;

        const [txDate, , description, chaseCategory, type, amountStr] = cols;
        const date = toISODate(txDate);
        const chaseAmount = parseFloat(amountStr);
        if (!date || Number.isNaN(chaseAmount)) return;

        const plaidAmount = chaseAmount * -1;
        const isPayment = type === "Payment" || type === "Adjustment";

        txs.push({
            transaction_id: `7885-${index}`,
            account_id: "chase-7885",
            amount: plaidAmount,
            date,
            name: description,
            merchant_name: description,
            category: isPayment ? ["Transfer"] : [chaseCategory || ""],
            pending: false,
            logo_url: null,
        });
    });

    return txs;
}

function parseChase6656(filePath: string): Transaction[] {
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").slice(1);
    const txs: Transaction[] = [];

    lines.forEach((line, index) => {
        const cols = parseCsvLine(line);
        if (cols.length < 5) return;

        const [, postDate, description, amountStr, type] = cols;
        const date = toISODate(postDate);
        const chaseAmount = parseFloat(amountStr);
        if (!date || Number.isNaN(chaseAmount)) return;

        const plaidAmount = chaseAmount * -1;
        const isTransfer = type === "LOAN_PMT" || type === "ACCT_XFER";
        const isInvestment = /robinhood|schwab/i.test(description);
        const isStudentLoan = /dept education|student ln/i.test(description);
        const isRent = /bilt|yardi/i.test(description);
        const isUtility = /dominion energy/i.test(description);
        const isVenmoCashout = /venmo.*cashout/i.test(description);

        let category: string[];
        if (isTransfer || isInvestment || isStudentLoan) category = ["Transfer"];
        else if (isRent) category = ["Housing"];
        else if (isUtility) category = ["Utilities"];
        else if (isVenmoCashout) category = ["Income"];
        else category = [""];

        txs.push({
            transaction_id: `6656-${index}`,
            account_id: "chase-6656",
            amount: plaidAmount,
            date,
            name: description,
            merchant_name: description,
            category,
            pending: false,
            logo_url: null,
        });
    });

    return txs;
}

function monthKey(date: string): string {
    return date.substring(0, 7);
}

function parseDate(date: string): Date {
    return new Date(`${date}T12:00:00`);
}

function endOfMonth(month: string): Date {
    const [year, mm] = month.split("-").map((v) => parseInt(v, 10));
    return new Date(year, mm, 0, 12, 0, 0);
}

function monthBefore(month: string): string {
    const [year, mm] = month.split("-").map((v) => parseInt(v, 10));
    const d = new Date(year, mm - 2, 1, 12, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

function safePctErr(predicted: number, actual: number): number {
    if (Math.abs(actual) < 1e-6) return predicted === 0 ? 0 : 100;
    return Math.abs(((predicted - actual) / actual) * 100);
}

function normalizedAmount(raw: Transaction): number {
    return raw.amount * -1;
}

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

function buildOutgoingTransferIndex(transactions: Transaction[]): Map<number, string[]> {
    const index = new Map<number, string[]>();

    for (const tx of transactions) {
        if (tx.pending) continue;
        if (typeof tx.amount !== "number" || !Number.isFinite(tx.amount) || tx.amount <= 0) continue;
        const category = inferCategory(tx);
        if (category !== "Transfer") continue;

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
    return dates.some((candidateDate) => Math.abs((parseDate(candidateDate).getTime() - parseDate(date).getTime()) / 86_400_000) <= maxGapDays);
}

function resolvedActualCategory(raw: Transaction, outgoingTransferIndex: Map<number, string[]>): string {
    let category = inferCategory(raw);
    const flippedAmount = normalizedAmount(raw);

    if (category === "Transfer" && flippedAmount > 0) {
        const allCats = (Array.isArray(raw.category)
            ? raw.category
            : [raw.category || ""])
            .join(" ")
            .toLowerCase();
        const rawName = (raw.merchant_name || raw.name || "").toLowerCase();
        const looksIncomeLike = INCOME_CATEGORY_PATTERNS.test(allCats) || INCOME_NAME_PATTERNS.test(rawName);
        const hasMirrorTransfer = hasNearbyOutgoingTransfer(Math.abs(raw.amount), raw.date, outgoingTransferIndex);
        if (looksIncomeLike && !hasMirrorTransfer) {
            category = "Income";
        }
    }

    return normalizeForecastCategory(category);
}

function isForecastableActual(raw: Transaction, outgoingTransferIndex: Map<number, string[]>): boolean {
    if (raw.pending) return false;
    const category = resolvedActualCategory(raw, outgoingTransferIndex);
    if (category === "Transfer" && raw.amount > 0) return false;
    return category !== "Transfer";
}

function monthlyTotalsForecast(forecast: Forecast, targetMonth: string): {
    income: number;
    expenses: number;
    net: number;
    expenseMerchants: string[];
} {
    const monthTx = forecast.predicted_transactions.filter((tx) => tx.date.startsWith(targetMonth));
    const income = monthTx.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const expenses = monthTx.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const expenseMerchants = monthTx
        .filter((tx) => tx.amount < 0)
        .map((tx) => cleanMerchantName(tx.merchant || "").toLowerCase().trim());

    return { income, expenses, net: income - expenses, expenseMerchants };
}

function monthlyTotalsActual(transactions: Transaction[], targetMonth: string): {
    income: number;
    expenses: number;
    net: number;
    topExpenseMerchants: string[];
} {
    const outgoingTransferIndex = buildOutgoingTransferIndex(transactions);
    const monthTx = transactions
        .filter((tx) => tx.date.startsWith(targetMonth))
        .filter((tx) => isForecastableActual(tx, outgoingTransferIndex));

    const income = monthTx
        .map(normalizedAmount)
        .filter((amount) => amount > 0)
        .reduce((sum, amount) => sum + amount, 0);

    const expenses = monthTx
        .map(normalizedAmount)
        .filter((amount) => amount < 0)
        .reduce((sum, amount) => sum + Math.abs(amount), 0);

    const byMerchant = new Map<string, number>();
    for (const tx of monthTx) {
        const amount = normalizedAmount(tx);
        if (amount >= 0) continue;
        const merchant = cleanMerchantName(tx.merchant_name || tx.name || "Unknown").toLowerCase().trim();
        byMerchant.set(merchant, (byMerchant.get(merchant) || 0) + Math.abs(amount));
    }

    const topExpenseMerchants = [...byMerchant.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([merchant]) => merchant);

    return { income, expenses, net: income - expenses, topExpenseMerchants };
}

function computeCoverage(actualTop: string[], forecastedExpenseMerchants: string[]): number {
    if (actualTop.length === 0) return 100;
    const predictedSet = new Set(forecastedExpenseMerchants);
    const covered = actualTop.filter((merchant) => predictedSet.has(merchant)).length;
    return (covered / actualTop.length) * 100;
}

function getTargetMonths(transactions: Transaction[]): string[] {
    const months = [...new Set(transactions.map((tx) => monthKey(tx.date)))].sort();
    if (months.length <= 2) return [];

    const latest = months[months.length - 1];
    return months.filter((month) => month < latest).slice(1);
}

export async function runGeminiAudit(): Promise<GeminiAuditSummary> {
    const file7885 = path.join(process.cwd(), "Chase7885_Activity20240224_20260224_20260224.CSV");
    const file6656 = path.join(process.cwd(), "Chase6656_Activity_20260224.CSV");

    if (!fs.existsSync(file7885) || !fs.existsSync(file6656)) {
        throw new Error("Gemini audit requires Chase CSV files in workspace root.");
    }

    const transactions = [...parseChase7885(file7885), ...parseChase6656(file6656)]
        .sort((a, b) => a.date.localeCompare(b.date));

    const targetMonths = getTargetMonths(transactions);
    if (targetMonths.length === 0) {
        throw new Error("Not enough complete historical months for Gemini audit.");
    }

    const rows: MonthlyMetrics[] = [];
    const shockIncomeCreditThreshold = getEnvNumber("ARC_AUDIT_SHOCK_INCOME_CREDIT", 1000);
    let geminiSuccesses = 0;
    let improvementCount = 0;
    let degradationCount = 0;

    console.log(`\n[Gemini Audit] Testing ${targetMonths.length} months with both deterministic and Gemini-enhanced forecasts...`);

    for (let i = 0; i < targetMonths.length; i++) {
        const month = targetMonths[i];
        const priorMonth = monthBefore(month);
        const asOf = endOfMonth(priorMonth);
        const history = transactions.filter((tx) => parseDate(tx.date) <= asOf);

        if (history.length < 80) continue;

        console.log(`[Gemini Audit] Processing ${month} (${i + 1}/${targetMonths.length})...`);

        // Test deterministic forecast
        const deterministicForecast = validateForecast(generateDeterministicForecast(history, asOf), asOf);
        const deterministicPredicted = monthlyTotalsForecast(deterministicForecast, month);

        // Test Gemini-enhanced forecast (if API key available)
        let geminiPredicted = deterministicPredicted;
        let forecastMethod: "deterministic" | "gemini-enhanced" = "deterministic";
        
        if (process.env.GEMINI_API_KEY) {
            try {
                const geminiForecast = await geminiClient.generateForecast(history, true);
                geminiPredicted = monthlyTotalsForecast(geminiForecast, month);
                forecastMethod = "gemini-enhanced";
                geminiSuccesses++;
            } catch (error) {
                console.warn(`[Gemini Audit] Gemini failed for ${month}, using deterministic fallback`);
            }
        }

        // Calculate actuals
        const actual = monthlyTotalsActual(transactions, month);
        const monthTransactions = transactions.filter((tx) => tx.date.startsWith(month));
        const outgoingTransferIndex = buildOutgoingTransferIndex(monthTransactions);
        const monthActualIncome = transactions
            .filter((tx) => tx.date.startsWith(month))
            .filter((tx) => isForecastableActual(tx, outgoingTransferIndex))
            .filter((tx) => normalizedAmount(tx) > 0);
        const largestIncomeCredit = monthActualIncome.reduce((max, tx) => Math.max(max, normalizedAmount(tx)), 0);
        const isShockMonth = largestIncomeCredit >= shockIncomeCreditThreshold;

        // Compare error rates
        const deterministicExpenseErr = safePctErr(deterministicPredicted.expenses, actual.expenses);
        const geminiExpenseErr = safePctErr(geminiPredicted.expenses, actual.expenses);
        
        if (forecastMethod === "gemini-enhanced") {
            if (geminiExpenseErr < deterministicExpenseErr) {
                improvementCount++;
            } else if (geminiExpenseErr > deterministicExpenseErr) {
                degradationCount++;
            }
        }

        const expenseAbsErrPct = safePctErr(geminiPredicted.expenses, actual.expenses);
        const incomeAbsErrPct = safePctErr(geminiPredicted.income, actual.income);
        const netAbsErr = Math.abs(geminiPredicted.net - actual.net);
        const merchantCoveragePct = computeCoverage(actual.topExpenseMerchants, geminiPredicted.expenseMerchants);

        const prev = rows[rows.length - 1];
        rows.push({
            month,
            historyTxCount: history.length,
            predictedIncome: geminiPredicted.income,
            actualIncome: actual.income,
            predictedExpenses: geminiPredicted.expenses,
            actualExpenses: actual.expenses,
            predictedNet: geminiPredicted.net,
            actualNet: actual.net,
            expenseAbsErrPct,
            incomeAbsErrPct,
            netAbsErr,
            merchantCoveragePct,
            expenseErrDriftPct: prev ? expenseAbsErrPct - prev.expenseAbsErrPct : null,
            incomeErrDriftPct: prev ? incomeAbsErrPct - prev.incomeAbsErrPct : null,
            largestIncomeCredit,
            isShockMonth,
            forecastMethod,
        });
    }

    if (rows.length === 0) {
        throw new Error("No months had enough history to backtest.");
    }

    const avgExpenseErr = rows.reduce((sum, row) => sum + row.expenseAbsErrPct, 0) / rows.length;
    const avgIncomeErr = rows.reduce((sum, row) => sum + row.incomeAbsErrPct, 0) / rows.length;
    const avgNetAbsErr = rows.reduce((sum, row) => sum + row.netAbsErr, 0) / rows.length;
    const avgCoverage = rows.reduce((sum, row) => sum + row.merchantCoveragePct, 0) / rows.length;

    // Separate analysis for deterministic vs. Gemini-enhanced
    const deterministicRows = rows.filter(row => row.forecastMethod === "deterministic");
    const geminiRows = rows.filter(row => row.forecastMethod === "gemini-enhanced");

    const deterministicAvgExpenseErr = deterministicRows.length > 0
        ? deterministicRows.reduce((sum, row) => sum + row.expenseAbsErrPct, 0) / deterministicRows.length
        : 0;
    const deterministicAvgIncomeErr = deterministicRows.length > 0
        ? deterministicRows.reduce((sum, row) => sum + row.incomeAbsErrPct, 0) / deterministicRows.length
        : 0;

    const geminiAvgExpenseErr = geminiRows.length > 0
        ? geminiRows.reduce((sum, row) => sum + row.expenseAbsErrPct, 0) / geminiRows.length
        : 0;
    const geminiAvgIncomeErr = geminiRows.length > 0
        ? geminiRows.reduce((sum, row) => sum + row.incomeAbsErrPct, 0) / geminiRows.length
        : 0;

    const geminiSuccessRate = rows.length > 0 ? (geminiSuccesses / rows.length) * 100 : 0;

    return {
        rows,
        avgExpenseErr,
        avgIncomeErr,
        avgNetAbsErr,
        avgCoverage,
        deterministicAvgExpenseErr,
        deterministicAvgIncomeErr,
        geminiAvgExpenseErr,
        geminiAvgIncomeErr,
        geminiSuccessRate,
        improvementCount,
        degradationCount,
        shockIncomeCreditThreshold,
    };
}

async function main(): Promise<void> {
    try {
        const summary = await runGeminiAudit();

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("  GEMINI-ENHANCED FORECAST AUDIT (vs. DETERMINISTIC BASELINE)");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        const printable = summary.rows.map((row) => ({
            month: row.month,
            method: row.forecastMethod === "gemini-enhanced" ? "Gemini" : "Determin",
            histTx: row.historyTxCount,
            expMAPE: `${row.expenseAbsErrPct.toFixed(1)}%`,
            incMAPE: `${row.incomeAbsErrPct.toFixed(1)}%`,
            netAbsErr: `$${row.netAbsErr.toFixed(0)}`,
            shock: row.isShockMonth ? "Y" : "N",
            coverage: `${row.merchantCoveragePct.toFixed(0)}%`,
        }));

        console.table(printable);

        console.log("\n📊 OVERALL PERFORMANCE:");
        console.log(`Overall avg expense MAPE: ${summary.avgExpenseErr.toFixed(1)}%`);
        console.log(`Overall avg income MAPE: ${summary.avgIncomeErr.toFixed(1)}%`);
        console.log(`Overall avg net absolute error: $${summary.avgNetAbsErr.toFixed(0)}`);
        console.log(`Overall avg merchant coverage: ${summary.avgCoverage.toFixed(1)}%`);

        console.log("\n🤖 GEMINI vs. DETERMINISTIC COMPARISON:");
        console.log(`Gemini success rate: ${summary.geminiSuccessRate.toFixed(1)}%`);
        console.log(`Deterministic avg expense MAPE: ${summary.deterministicAvgExpenseErr.toFixed(1)}%`);
        console.log(`Gemini-enhanced avg expense MAPE: ${summary.geminiAvgExpenseErr.toFixed(1)}%`);
        console.log(`Deterministic avg income MAPE: ${summary.deterministicAvgIncomeErr.toFixed(1)}%`);
        console.log(`Gemini-enhanced avg income MAPE: ${summary.geminiAvgIncomeErr.toFixed(1)}%`);

        console.log("\n📈 IMPROVEMENT ANALYSIS:");
        console.log(`Months where Gemini improved accuracy: ${summary.improvementCount}`);
        console.log(`Months where Gemini degraded accuracy: ${summary.degradationCount}`);
        
        const improvementRate = summary.improvementCount + summary.degradationCount > 0 
            ? (summary.improvementCount / (summary.improvementCount + summary.degradationCount)) * 100 
            : 0;
        console.log(`Gemini improvement rate: ${improvementRate.toFixed(1)}%`);

        if (summary.geminiAvgExpenseErr > 0 && summary.deterministicAvgExpenseErr > 0) {
            const expenseImprovement = ((summary.deterministicAvgExpenseErr - summary.geminiAvgExpenseErr) / summary.deterministicAvgExpenseErr) * 100;
            console.log(`\n🎯 EXPENSE FORECAST IMPROVEMENT: ${expenseImprovement >= 0 ? '+' : ''}${expenseImprovement.toFixed(1)}%`);
        }

        if (summary.geminiAvgIncomeErr > 0 && summary.deterministicAvgIncomeErr > 0) {
            const incomeImprovement = ((summary.deterministicAvgIncomeErr - summary.geminiAvgIncomeErr) / summary.deterministicAvgIncomeErr) * 100;
            console.log(`💰 INCOME FORECAST IMPROVEMENT: ${incomeImprovement >= 0 ? '+' : ''}${incomeImprovement.toFixed(1)}%`);
        }

        console.log();

    } catch (error) {
        console.error("Gemini audit failed:", error);
        process.exit(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}