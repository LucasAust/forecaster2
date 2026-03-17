import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { generateDeterministicForecast, validateForecast } from "../lib/forecast-engine";
import { inferCategory } from "../lib/categories";
import { cleanMerchantName } from "../lib/merchants";
import type { Forecast, PredictedTransaction, Transaction } from "../types";

type IncomeSource = "payroll" | "interest" | "cashout" | "check_deposit" | "refund" | "transfer_like" | "other";

type MonthSummary = {
    month: string;
    historyTxCount: number;
    predictedIncome: number;
    actualIncome: number;
    predictedExpenses: number;
    actualExpenses: number;
    predictedNet: number;
    actualNet: number;
    incomeAbsErrPct: number;
    expenseAbsErrPct: number;
    netAbsErr: number;
};

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

function parseDate(date: string): Date {
    return new Date(`${date}T12:00:00`);
}

function monthKey(date: string): string {
    return date.slice(0, 7);
}

function monthBefore(month: string): string {
    const [year, mm] = month.split("-").map((value) => parseInt(value, 10));
    const d = new Date(year, mm - 2, 1, 12, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function endOfMonth(month: string): Date {
    const [year, mm] = month.split("-").map((value) => parseInt(value, 10));
    return new Date(year, mm, 0, 12, 0, 0);
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function safePctErr(predicted: number, actual: number): number {
    if (Math.abs(actual) < 1e-6) return predicted === 0 ? 0 : 100;
    return Math.abs(((predicted - actual) / actual) * 100);
}

function normalizedAmount(raw: Transaction): number {
    return raw.amount * -1;
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

const INCOME_NAME_PATTERNS =
    /payroll|direct\s*dep|\bach\s*credit\b|salary|wage|interest\s*(paid|earn|credit)|tax\s*refund|irs\s*treas|reimb|bonus\s*pay|commission|tip\s*income|dividend|venmo\s*cashout|online\s*transfer\s*from\s*chk|real\s*time\s*payment\s*credit\s*recd|deposit\s+id\s+number/i;

const INCOME_CATEGORY_PATTERNS =
    /payroll|direct\s*dep|deposit|income|salary|interest\s*(earn|paid|credit)|tax\s*refund|reimb/;

function normalizeForecastCategory(category: string): string {
    if (category === "Income" || category === "Transfer" || category === "Housing" || category === "Utilities") return category;
    if (category === "Groceries" || category === "Food & Drink" || category === "Shopping") return "Groceries";
    if (category === "Transport" || category === "Auto" || category === "Travel") return "Transport";
    if (category === "Healthcare" || category === "Personal Care") return "Healthcare";
    if (category === "Subscriptions" || category === "Entertainment") return "Entertainment";
    if (category === "Insurance") return "Utilities";
    return "Other";
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

function buildOutgoingTransferIndex(transactions: Transaction[]): Map<number, string[]> {
    const index = new Map<number, string[]>();
    for (const tx of transactions) {
        if (tx.pending) continue;
        if (!Number.isFinite(tx.amount) || tx.amount <= 0) continue;
        if (inferCategory(tx) !== "Transfer") continue;
        const cents = Math.round(Math.abs(tx.amount) * 100);
        const dates = index.get(cents) || [];
        dates.push(tx.date);
        index.set(cents, dates);
    }
    return index;
}

function hasNearbyOutgoingTransfer(plaidAmountAbs: number, date: string, outgoingTransferIndex: Map<number, string[]>, maxGapDays: number = 1): boolean {
    const dates = outgoingTransferIndex.get(Math.round(plaidAmountAbs * 100));
    if (!dates || dates.length === 0) return false;
    return dates.some((candidateDate) => Math.abs((parseDate(candidateDate).getTime() - parseDate(date).getTime()) / 86_400_000) <= maxGapDays);
}

function resolvedActualCategory(raw: Transaction, outgoingTransferIndex: Map<number, string[]>): string {
    let category = inferCategory(raw);
    const flippedAmount = normalizedAmount(raw);

    if (category === "Transfer" && flippedAmount > 0) {
        const allCats = (Array.isArray(raw.category) ? raw.category : [raw.category || ""]).join(" ").toLowerCase();
        const rawName = (raw.merchant_name || raw.name || "").toLowerCase();
        const looksIncomeLike = INCOME_CATEGORY_PATTERNS.test(allCats) || INCOME_NAME_PATTERNS.test(rawName);
        const hasMirrorTransfer = hasNearbyOutgoingTransfer(Math.abs(raw.amount), raw.date, outgoingTransferIndex);
        if (looksIncomeLike && !hasMirrorTransfer) category = "Income";
    }

    return normalizeForecastCategory(category);
}

function isForecastableActual(raw: Transaction, outgoingTransferIndex: Map<number, string[]>): boolean {
    if (raw.pending) return false;
    const category = resolvedActualCategory(raw, outgoingTransferIndex);
    if (category === "Transfer" && raw.amount > 0) return false;
    return category !== "Transfer";
}

function toCsv(rows: Array<Record<string, string | number>>): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escapeValue = (value: string | number): string => {
        const str = String(value ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const lines = [headers.join(",")];
    for (const row of rows) {
        lines.push(headers.map((header) => escapeValue(row[header] ?? "")).join(","));
    }
    return `${lines.join("\n")}\n`;
}

function main(): void {
    const file7885 = path.join(process.cwd(), "Chase7885_Activity20240224_20260224_20260224.CSV");
    const file6656 = path.join(process.cwd(), "Chase6656_Activity_20260224.CSV");
    if (!fs.existsSync(file7885) || !fs.existsSync(file6656)) {
        throw new Error("Real-data deep dive requires Chase CSV files in workspace root.");
    }

    const transactions = [...parseChase7885(file7885), ...parseChase6656(file6656)].sort((a, b) => a.date.localeCompare(b.date));
    const months = [...new Set(transactions.map((tx) => monthKey(tx.date)))].sort();
    const targetMonths = months.filter((month) => month < months[months.length - 1]).slice(1);

    const monthSummaryRows: MonthSummary[] = [];
    const sourceMonthlyRows: Array<Record<string, string | number>> = [];
    const categoryMonthlyRows: Array<Record<string, string | number>> = [];
    const merchantMissRows: Array<Record<string, string | number>> = [];
    const horizonRows: Array<Record<string, string | number>> = [];
    const largeCreditRows: Array<Record<string, string | number>> = [];

    for (const month of targetMonths) {
        const asOf = endOfMonth(monthBefore(month));
        const history = transactions.filter((tx) => parseDate(tx.date) <= asOf);
        if (history.length < 80) continue;

        const forecast = validateForecast(generateDeterministicForecast(history, asOf), asOf);
        const monthTxPred = forecast.predicted_transactions.filter((tx) => tx.date.startsWith(month));
        const monthTxRaw = transactions.filter((tx) => tx.date.startsWith(month));
        const outgoingTransferIndex = buildOutgoingTransferIndex(monthTxRaw);
        const monthTxActual = monthTxRaw.filter((tx) => isForecastableActual(tx, outgoingTransferIndex));

        const predictedIncome = monthTxPred.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
        const predictedExpenses = monthTxPred.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const actualIncome = monthTxActual.map(normalizedAmount).filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0);
        const actualExpenses = monthTxActual.map(normalizedAmount).filter((amount) => amount < 0).reduce((sum, amount) => sum + Math.abs(amount), 0);

        monthSummaryRows.push({
            month,
            historyTxCount: history.length,
            predictedIncome,
            actualIncome,
            predictedExpenses,
            actualExpenses,
            predictedNet: predictedIncome - predictedExpenses,
            actualNet: actualIncome - actualExpenses,
            incomeAbsErrPct: safePctErr(predictedIncome, actualIncome),
            expenseAbsErrPct: safePctErr(predictedExpenses, actualExpenses),
            netAbsErr: Math.abs((predictedIncome - predictedExpenses) - (actualIncome - actualExpenses)),
        });

        const predIncomeBySource = new Map<IncomeSource, number>();
        const actualIncomeBySource = new Map<IncomeSource, number>();

        for (const tx of monthTxPred.filter((tx) => tx.amount > 0)) {
            const source = classifyIncomeSource(tx.merchant, tx.category);
            predIncomeBySource.set(source, (predIncomeBySource.get(source) || 0) + tx.amount);
        }
        for (const tx of monthTxActual.filter((tx) => normalizedAmount(tx) > 0)) {
            const category = resolvedActualCategory(tx, outgoingTransferIndex);
            const source = classifyIncomeSource(cleanMerchantName(tx.merchant_name || tx.name || "Unknown"), category);
            const amount = normalizedAmount(tx);
            actualIncomeBySource.set(source, (actualIncomeBySource.get(source) || 0) + amount);

            if (amount >= 1000) {
                largeCreditRows.push({
                    month,
                    date: tx.date,
                    merchant: cleanMerchantName(tx.merchant_name || tx.name || "Unknown"),
                    source,
                    amount: amount.toFixed(2),
                    inferredCategory: category,
                });
            }
        }

        const sourceSet = new Set<IncomeSource>([...predIncomeBySource.keys(), ...actualIncomeBySource.keys()]);
        for (const source of sourceSet) {
            const predicted = predIncomeBySource.get(source) || 0;
            const actual = actualIncomeBySource.get(source) || 0;
            sourceMonthlyRows.push({
                month,
                source,
                predicted: predicted.toFixed(2),
                actual: actual.toFixed(2),
                errPct: safePctErr(predicted, actual).toFixed(2),
                absErr: Math.abs(predicted - actual).toFixed(2),
            });
        }

        const predExpenseByCategory = new Map<string, number>();
        const actualExpenseByCategory = new Map<string, number>();
        for (const tx of monthTxPred.filter((tx) => tx.amount < 0)) {
            predExpenseByCategory.set(tx.category, (predExpenseByCategory.get(tx.category) || 0) + Math.abs(tx.amount));
        }
        for (const tx of monthTxActual) {
            const amount = normalizedAmount(tx);
            if (amount >= 0) continue;
            const category = resolvedActualCategory(tx, outgoingTransferIndex);
            actualExpenseByCategory.set(category, (actualExpenseByCategory.get(category) || 0) + Math.abs(amount));
        }

        const categorySet = new Set<string>([...predExpenseByCategory.keys(), ...actualExpenseByCategory.keys()]);
        for (const category of categorySet) {
            const predicted = predExpenseByCategory.get(category) || 0;
            const actual = actualExpenseByCategory.get(category) || 0;
            categoryMonthlyRows.push({
                month,
                category,
                predicted: predicted.toFixed(2),
                actual: actual.toFixed(2),
                errPct: safePctErr(predicted, actual).toFixed(2),
                absErr: Math.abs(predicted - actual).toFixed(2),
            });
        }

        const predExpenseByMerchant = new Map<string, number>();
        const actualExpenseByMerchant = new Map<string, number>();
        for (const tx of monthTxPred.filter((tx) => tx.amount < 0)) {
            const merchant = cleanMerchantName(tx.merchant || "Unknown").toLowerCase().trim();
            predExpenseByMerchant.set(merchant, (predExpenseByMerchant.get(merchant) || 0) + Math.abs(tx.amount));
        }
        for (const tx of monthTxActual) {
            const amount = normalizedAmount(tx);
            if (amount >= 0) continue;
            const merchant = cleanMerchantName(tx.merchant_name || tx.name || "Unknown").toLowerCase().trim();
            actualExpenseByMerchant.set(merchant, (actualExpenseByMerchant.get(merchant) || 0) + Math.abs(amount));
        }

        const merchantSet = new Set<string>([...predExpenseByMerchant.keys(), ...actualExpenseByMerchant.keys()]);
        const merchantGaps = [...merchantSet]
            .map((merchant) => {
                const predicted = predExpenseByMerchant.get(merchant) || 0;
                const actual = actualExpenseByMerchant.get(merchant) || 0;
                return {
                    merchant,
                    predicted,
                    actual,
                    absGap: Math.abs(predicted - actual),
                };
            })
            .sort((a, b) => b.absGap - a.absGap)
            .slice(0, 20);

        for (const gap of merchantGaps) {
            merchantMissRows.push({
                month,
                merchant: gap.merchant,
                predicted: gap.predicted.toFixed(2),
                actual: gap.actual.toFixed(2),
                absGap: gap.absGap.toFixed(2),
            });
        }

        const horizonWindows = [30, 60, 90];
        const start = addDays(asOf, 1);
        for (const horizonDays of horizonWindows) {
            const end = addDays(start, horizonDays - 1);
            const startIso = `${start.toISOString().split("T")[0]}`;
            const endIso = `${end.toISOString().split("T")[0]}`;

            const predWindow = forecast.predicted_transactions.filter((tx) => tx.date >= startIso && tx.date <= endIso);
            const rawWindow = transactions.filter((tx) => tx.date >= startIso && tx.date <= endIso);
            const outIdx = buildOutgoingTransferIndex(rawWindow);
            const actualWindow = rawWindow.filter((tx) => isForecastableActual(tx, outIdx));

            const predInc = predWindow.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
            const predExp = predWindow.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const actInc = actualWindow.map(normalizedAmount).filter((a) => a > 0).reduce((sum, a) => sum + a, 0);
            const actExp = actualWindow.map(normalizedAmount).filter((a) => a < 0).reduce((sum, a) => sum + Math.abs(a), 0);

            horizonRows.push({
                anchorMonth: month,
                horizonDays,
                start: startIso,
                end: endIso,
                predictedIncome: predInc.toFixed(2),
                actualIncome: actInc.toFixed(2),
                incomeErrPct: safePctErr(predInc, actInc).toFixed(2),
                predictedExpenses: predExp.toFixed(2),
                actualExpenses: actExp.toFixed(2),
                expenseErrPct: safePctErr(predExp, actExp).toFixed(2),
                netAbsErr: Math.abs((predInc - predExp) - (actInc - actExp)).toFixed(2),
            });
        }
    }

    const runTag = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(process.cwd(), "diagnostics", `deep-dive-${runTag}`);
    fs.mkdirSync(outDir, { recursive: true });

    const monthSummaryCsv = toCsv(monthSummaryRows.map((row) => ({
        month: row.month,
        historyTxCount: row.historyTxCount,
        predictedIncome: row.predictedIncome.toFixed(2),
        actualIncome: row.actualIncome.toFixed(2),
        incomeAbsErrPct: row.incomeAbsErrPct.toFixed(2),
        predictedExpenses: row.predictedExpenses.toFixed(2),
        actualExpenses: row.actualExpenses.toFixed(2),
        expenseAbsErrPct: row.expenseAbsErrPct.toFixed(2),
        predictedNet: row.predictedNet.toFixed(2),
        actualNet: row.actualNet.toFixed(2),
        netAbsErr: row.netAbsErr.toFixed(2),
    })));

    fs.writeFileSync(path.join(outDir, "month_summary.csv"), monthSummaryCsv, "utf-8");
    fs.writeFileSync(path.join(outDir, "income_source_monthly.csv"), toCsv(sourceMonthlyRows), "utf-8");
    fs.writeFileSync(path.join(outDir, "expense_category_monthly.csv"), toCsv(categoryMonthlyRows), "utf-8");
    fs.writeFileSync(path.join(outDir, "merchant_miss_top20_by_month.csv"), toCsv(merchantMissRows), "utf-8");
    fs.writeFileSync(path.join(outDir, "horizon_30_60_90.csv"), toCsv(horizonRows), "utf-8");
    fs.writeFileSync(path.join(outDir, "large_credit_events_1000_plus.csv"), toCsv(largeCreditRows), "utf-8");

    const sourceSeasonalityMap = new Map<string, { source: string; monthOfYear: string; actual: number; predicted: number; count: number }>();
    for (const row of sourceMonthlyRows) {
        const source = String(row.source);
        const month = String(row.month);
        const monthOfYear = month.slice(5, 7);
        const key = `${source}|${monthOfYear}`;
        const prev = sourceSeasonalityMap.get(key) || { source, monthOfYear, actual: 0, predicted: 0, count: 0 };
        prev.actual += Number(row.actual);
        prev.predicted += Number(row.predicted);
        prev.count += 1;
        sourceSeasonalityMap.set(key, prev);
    }

    const sourceSeasonalityRows = [...sourceSeasonalityMap.values()]
        .map((row) => ({
            source: row.source,
            monthOfYear: row.monthOfYear,
            avgActual: (row.actual / Math.max(1, row.count)).toFixed(2),
            avgPredicted: (row.predicted / Math.max(1, row.count)).toFixed(2),
            avgErrPct: safePctErr(row.predicted / Math.max(1, row.count), row.actual / Math.max(1, row.count)).toFixed(2),
            samples: row.count,
        }))
        .sort((a, b) => a.source.localeCompare(b.source) || a.monthOfYear.localeCompare(b.monthOfYear));

    fs.writeFileSync(path.join(outDir, "income_source_seasonality.csv"), toCsv(sourceSeasonalityRows), "utf-8");

    const worstMonths = [...monthSummaryRows]
        .sort((a, b) => b.netAbsErr - a.netAbsErr)
        .slice(0, 6)
        .map((row) => ({
            month: row.month,
            netAbsErr: Number(row.netAbsErr.toFixed(2)),
            incomeAbsErrPct: Number(row.incomeAbsErrPct.toFixed(2)),
            expenseAbsErrPct: Number(row.expenseAbsErrPct.toFixed(2)),
            predictedNet: Number(row.predictedNet.toFixed(2)),
            actualNet: Number(row.actualNet.toFixed(2)),
        }));

    fs.writeFileSync(
        path.join(outDir, "summary.json"),
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                outputDir: outDir,
                monthsAnalyzed: monthSummaryRows.length,
                avgIncomeErrPct: Number((monthSummaryRows.reduce((sum, row) => sum + row.incomeAbsErrPct, 0) / Math.max(1, monthSummaryRows.length)).toFixed(2)),
                avgExpenseErrPct: Number((monthSummaryRows.reduce((sum, row) => sum + row.expenseAbsErrPct, 0) / Math.max(1, monthSummaryRows.length)).toFixed(2)),
                avgNetAbsErr: Number((monthSummaryRows.reduce((sum, row) => sum + row.netAbsErr, 0) / Math.max(1, monthSummaryRows.length)).toFixed(2)),
                worstMonths,
            },
            null,
            2,
        ),
        "utf-8",
    );

    console.log("\nDeep dive complete.");
    console.log(`Output directory: ${outDir}`);
    console.log("Artifacts:");
    console.log("- month_summary.csv");
    console.log("- income_source_monthly.csv");
    console.log("- expense_category_monthly.csv");
    console.log("- merchant_miss_top20_by_month.csv");
    console.log("- horizon_30_60_90.csv");
    console.log("- large_credit_events_1000_plus.csv");
    console.log("- income_source_seasonality.csv");
    console.log("- summary.json\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
