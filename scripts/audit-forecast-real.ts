import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
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
};

type IncomeSource = "payroll" | "interest" | "cashout" | "check_deposit" | "refund" | "transfer_like" | "other";

export type RealAuditSummary = {
    rows: MonthlyMetrics[];
    avgExpenseErr: number;
    avgIncomeErr: number;
    avgNetAbsErr: number;
    avgCoverage: number;
    coreAvgExpenseErr: number;
    coreAvgIncomeErr: number;
    coreAvgNetAbsErr: number;
    shockAvgExpenseErr: number;
    shockAvgIncomeErr: number;
    shockAvgNetAbsErr: number;
    coreMonthCount: number;
    shockMonthCount: number;
    shockIncomeCreditThreshold: number;
    sourceRows: Array<{ source: IncomeSource; actual: number; predicted: number; errPct: number }>;
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
    return date.slice(0, 7);
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

export function runRealAudit(): RealAuditSummary {
    const file7885 = path.join(process.cwd(), "Chase7885_Activity20240224_20260224_20260224.CSV");
    const file6656 = path.join(process.cwd(), "Chase6656_Activity_20260224.CSV");

    if (!fs.existsSync(file7885) || !fs.existsSync(file6656)) {
        throw new Error("Real-data audit requires Chase CSV files in workspace root.");
    }

    const transactions = [...parseChase7885(file7885), ...parseChase6656(file6656)]
        .sort((a, b) => a.date.localeCompare(b.date));

    const targetMonths = getTargetMonths(transactions);
    if (targetMonths.length === 0) {
        throw new Error("Not enough complete historical months for drift audit.");
    }

    const rows: MonthlyMetrics[] = [];
    const sourceActualTotals = new Map<IncomeSource, number>();
    const sourcePredTotals = new Map<IncomeSource, number>();
    const shockIncomeCreditThreshold = getEnvNumber("ARC_AUDIT_SHOCK_INCOME_CREDIT", 1000);

    for (const month of targetMonths) {
        const priorMonth = monthBefore(month);
        const asOf = endOfMonth(priorMonth);
        const history = transactions.filter((tx) => parseDate(tx.date) <= asOf);

        if (history.length < 80) continue;

        const forecast = validateForecast(generateDeterministicForecast(history, asOf), asOf);
        const predicted = monthlyTotalsForecast(forecast, month);
        const actual = monthlyTotalsActual(transactions, month);

        const monthPredIncome = forecast.predicted_transactions
            .filter((tx) => tx.date.startsWith(month) && tx.amount > 0);
        const monthTransactions = transactions.filter((tx) => tx.date.startsWith(month));
        const outgoingTransferIndex = buildOutgoingTransferIndex(monthTransactions);
        const monthActualIncome = transactions
            .filter((tx) => tx.date.startsWith(month))
            .filter((tx) => isForecastableActual(tx, outgoingTransferIndex))
            .filter((tx) => normalizedAmount(tx) > 0);
        const largestIncomeCredit = monthActualIncome.reduce((max, tx) => Math.max(max, normalizedAmount(tx)), 0);
        const isShockMonth = largestIncomeCredit >= shockIncomeCreditThreshold;

        for (const tx of monthPredIncome) {
            const source = classifyIncomeSource(tx.merchant, tx.category);
            sourcePredTotals.set(source, (sourcePredTotals.get(source) || 0) + tx.amount);
        }
        for (const tx of monthActualIncome) {
            const source = classifyIncomeSource(
                cleanMerchantName(tx.merchant_name || tx.name || "Unknown"),
                resolvedActualCategory(tx, outgoingTransferIndex),
            );
            sourceActualTotals.set(source, (sourceActualTotals.get(source) || 0) + normalizedAmount(tx));
        }

        const expenseAbsErrPct = safePctErr(predicted.expenses, actual.expenses);
        const incomeAbsErrPct = safePctErr(predicted.income, actual.income);
        const netAbsErr = Math.abs(predicted.net - actual.net);
        const merchantCoveragePct = computeCoverage(actual.topExpenseMerchants, predicted.expenseMerchants);

        const prev = rows[rows.length - 1];
        rows.push({
            month,
            historyTxCount: history.length,
            predictedIncome: predicted.income,
            actualIncome: actual.income,
            predictedExpenses: predicted.expenses,
            actualExpenses: actual.expenses,
            predictedNet: predicted.net,
            actualNet: actual.net,
            expenseAbsErrPct,
            incomeAbsErrPct,
            netAbsErr,
            merchantCoveragePct,
            expenseErrDriftPct: prev ? expenseAbsErrPct - prev.expenseAbsErrPct : null,
            incomeErrDriftPct: prev ? incomeAbsErrPct - prev.incomeAbsErrPct : null,
            largestIncomeCredit,
            isShockMonth,
        });
    }

    if (rows.length === 0) {
        throw new Error("No months had enough history to backtest.");
    }

    const avgExpenseErr = rows.reduce((sum, row) => sum + row.expenseAbsErrPct, 0) / rows.length;
    const avgIncomeErr = rows.reduce((sum, row) => sum + row.incomeAbsErrPct, 0) / rows.length;
    const avgNetAbsErr = rows.reduce((sum, row) => sum + row.netAbsErr, 0) / rows.length;
    const avgCoverage = rows.reduce((sum, row) => sum + row.merchantCoveragePct, 0) / rows.length;

    const coreRows = rows.filter((row) => !row.isShockMonth);
    const shockRows = rows.filter((row) => row.isShockMonth);
    const coreAvgExpenseErr = coreRows.length > 0
        ? coreRows.reduce((sum, row) => sum + row.expenseAbsErrPct, 0) / coreRows.length
        : avgExpenseErr;
    const coreAvgIncomeErr = coreRows.length > 0
        ? coreRows.reduce((sum, row) => sum + row.incomeAbsErrPct, 0) / coreRows.length
        : avgIncomeErr;
    const coreAvgNetAbsErr = coreRows.length > 0
        ? coreRows.reduce((sum, row) => sum + row.netAbsErr, 0) / coreRows.length
        : avgNetAbsErr;

    const shockAvgExpenseErr = shockRows.length > 0
        ? shockRows.reduce((sum, row) => sum + row.expenseAbsErrPct, 0) / shockRows.length
        : avgExpenseErr;
    const shockAvgIncomeErr = shockRows.length > 0
        ? shockRows.reduce((sum, row) => sum + row.incomeAbsErrPct, 0) / shockRows.length
        : avgIncomeErr;
    const shockAvgNetAbsErr = shockRows.length > 0
        ? shockRows.reduce((sum, row) => sum + row.netAbsErr, 0) / shockRows.length
        : avgNetAbsErr;

    const sources = new Set<IncomeSource>([
        ...sourceActualTotals.keys(),
        ...sourcePredTotals.keys(),
    ]);

    const sourceRows = [...sources]
        .map((source) => {
            const actual = sourceActualTotals.get(source) || 0;
            const predicted = sourcePredTotals.get(source) || 0;
            const errPct = safePctErr(predicted, actual);
            return {
                source,
                actual,
                predicted,
                errPct,
            };
        })
        .sort((a, b) => a.errPct - b.errPct);

    return {
        rows,
        avgExpenseErr,
        avgIncomeErr,
        avgNetAbsErr,
        avgCoverage,
        coreAvgExpenseErr,
        coreAvgIncomeErr,
        coreAvgNetAbsErr,
        shockAvgExpenseErr,
        shockAvgIncomeErr,
        shockAvgNetAbsErr,
        coreMonthCount: coreRows.length,
        shockMonthCount: shockRows.length,
        shockIncomeCreditThreshold,
        sourceRows,
    };
}

function main(): void {
    const summary = runRealAudit();

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  REAL-DATA FORECAST DRIFT AUDIT (MONTH-OVER-MONTH)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const printable = summary.rows.map((row) => ({
        month: row.month,
        histTx: row.historyTxCount,
        expMAPE: `${row.expenseAbsErrPct.toFixed(1)}%`,
        incMAPE: `${row.incomeAbsErrPct.toFixed(1)}%`,
        netAbsErr: `$${row.netAbsErr.toFixed(0)}`,
        shock: row.isShockMonth ? "Y" : "N",
        maxIncomeCredit: `$${row.largestIncomeCredit.toFixed(0)}`,
        merchantCoverage: `${row.merchantCoveragePct.toFixed(0)}%`,
        expDrift: row.expenseErrDriftPct === null ? "—" : `${row.expenseErrDriftPct >= 0 ? "+" : ""}${row.expenseErrDriftPct.toFixed(1)}%`,
        incDrift: row.incomeErrDriftPct === null ? "—" : `${row.incomeErrDriftPct >= 0 ? "+" : ""}${row.incomeErrDriftPct.toFixed(1)}%`,
    }));

    console.table(printable);

    console.log(`Avg expense MAPE: ${summary.avgExpenseErr.toFixed(1)}%`);
    console.log(`Avg income MAPE: ${summary.avgIncomeErr.toFixed(1)}%`);
    console.log(`Avg net absolute error: $${summary.avgNetAbsErr.toFixed(0)}`);
    console.log(`Avg top-merchant coverage: ${summary.avgCoverage.toFixed(1)}%`);
    console.log(`Shock split threshold (max monthly income credit): $${summary.shockIncomeCreditThreshold.toFixed(0)}`);
    console.log(`Core months: ${summary.coreMonthCount}, Shock months: ${summary.shockMonthCount}`);
    console.log(`Core avg expense MAPE: ${summary.coreAvgExpenseErr.toFixed(1)}%`);
    console.log(`Core avg income MAPE: ${summary.coreAvgIncomeErr.toFixed(1)}%`);
    console.log(`Core avg net absolute error: $${summary.coreAvgNetAbsErr.toFixed(0)}`);
    console.log(`Shock avg expense MAPE: ${summary.shockAvgExpenseErr.toFixed(1)}%`);
    console.log(`Shock avg income MAPE: ${summary.shockAvgIncomeErr.toFixed(1)}%`);
    console.log(`Shock avg net absolute error: $${summary.shockAvgNetAbsErr.toFixed(0)}`);

    const latest = summary.rows[summary.rows.length - 1];
    const trendExp = latest.expenseErrDriftPct === null ? "stable" : latest.expenseErrDriftPct < 0 ? "improving" : "worsening";
    const trendInc = latest.incomeErrDriftPct === null ? "stable" : latest.incomeErrDriftPct < 0 ? "improving" : "worsening";
    console.log(`Latest month trend: expense ${trendExp}, income ${trendInc}`);

    const sourcePrintable = summary.sourceRows.map((row) => ({
        source: row.source,
        actual: `$${row.actual.toFixed(0)}`,
        predicted: `$${row.predicted.toFixed(0)}`,
        errPct: `${row.errPct.toFixed(1)}%`,
    }));

    console.log("\nIncome source error breakdown:");
    console.table(sourcePrintable);
    console.log();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
