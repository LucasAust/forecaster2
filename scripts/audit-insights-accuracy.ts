/**
 * Audit: How much do insight answers improve forecast accuracy?
 * 
 * Reuses the CSV parsers from audit-forecast-real.ts and tests the
 * deterministic forecast with various InsightProfile configurations.
 */
import fs from "fs";
import path from "path";
import { generateDeterministicForecast } from "../lib/forecast-engine";
import type { Transaction } from "../types";
import type { InsightProfile } from "../lib/insight-questions";

// ─── CSV Parsers (from audit-forecast-real.ts) ──────────────

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { inQuote = !inQuote; continue; }
        if (char === "," && !inQuote) { out.push(current.trim()); current = ""; continue; }
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

// ─── Helpers ────────────────────────────────────────────────

function safePctErr(predicted: number, actual: number): number {
    if (Math.abs(actual) < 1e-6) return predicted === 0 ? 0 : 100;
    return Math.abs(((predicted - actual) / actual) * 100);
}

function monthKey(date: string): string { return date.slice(0, 7); }

// ─── Main ───────────────────────────────────────────────────

const projectRoot = path.join(__dirname, "..");
const f7885 = path.join(projectRoot, "Chase7885_Activity20240224_20260224_20260224.CSV");
const f6656 = path.join(projectRoot, "Chase6656_Activity_20260224.CSV");

const allTxs = [...parseChase7885(f7885), ...parseChase6656(f6656)]
    .sort((a, b) => a.date.localeCompare(b.date));

console.log(`Loaded ${allTxs.length} transactions (${allTxs[0]?.date} to ${allTxs[allTxs.length - 1]?.date})\n`);

// Build actual monthly totals (using Plaid convention: positive = expense, negative = income)
const actualsByMonth = new Map<string, { income: number; expenses: number }>();
for (const tx of allTxs) {
    const cat = Array.isArray(tx.category) ? tx.category[0] : tx.category;
    if (cat === "Transfer") continue;
    const month = monthKey(tx.date);
    if (!actualsByMonth.has(month)) actualsByMonth.set(month, { income: 0, expenses: 0 });
    const m = actualsByMonth.get(month)!;
    // Plaid: positive = expense, negative = income
    if (tx.amount < 0) m.income += Math.abs(tx.amount);
    else m.expenses += tx.amount;
}

const scenarios: { name: string; profile: InsightProfile | undefined }[] = [
    { name: "No insights (baseline)", profile: undefined },
    {
        name: "Recent anchor only",
        profile: { regime_change_confirmed: true, spending_anchor: "recent" },
    },
    {
        name: "Recent anchor + income $3800 (freelance)",
        profile: { regime_change_confirmed: true, spending_anchor: "recent", expected_monthly_income: 3800, income_type: "freelance" },
    },
    {
        name: "Recent anchor + income $3800 + expenses $3500",
        profile: { regime_change_confirmed: true, spending_anchor: "recent", expected_monthly_income: 3800, expected_monthly_expenses: 3500, income_type: "freelance" },
    },
    {
        name: "Recent anchor + income $3000 + expenses $3000",
        profile: { regime_change_confirmed: true, spending_anchor: "recent", expected_monthly_income: 3000, expected_monthly_expenses: 3000, income_type: "freelance" },
    },
    {
        name: "Recent anchor + income $1800 + expenses $3000 (freelance)",
        profile: { regime_change_confirmed: true, spending_anchor: "recent", expected_monthly_income: 1800, expected_monthly_expenses: 3000, income_type: "freelance" },
    },
    {
        name: "Recent anchor + expenses $3000 (no income override)",
        profile: { regime_change_confirmed: true, spending_anchor: "recent", expected_monthly_expenses: 3000, income_type: "freelance" },
    },
    {
        name: "Historical anchor (temporary spike)",
        profile: { regime_change_confirmed: false, spending_anchor: "historical" },
    },
    {
        name: "Student + aid + recent anchor + expenses $3000",
        profile: {
            regime_change_confirmed: true, spending_anchor: "recent",
            expected_monthly_expenses: 3000, income_type: "freelance",
            life_situation: "student_aid",
        },
    },
];

// Test months: 2025-04 through 2025-12 (need enough history for recent anchor)
const testMonths = [...actualsByMonth.keys()]
    .filter(m => m >= "2025-04" && m <= "2025-12")
    .sort();

console.log(`Testing ${testMonths.length} months: ${testMonths[0]} to ${testMonths[testMonths.length - 1]}\n`);

const summaryTable: { name: string; avgExp: number; avgInc: number; combined: number }[] = [];

for (const scenario of scenarios) {
    const expErrs: number[] = [];
    const incErrs: number[] = [];
    const monthResults: { month: string; predExp: number; actExp: number; predInc: number; actInc: number; expErr: number; incErr: number }[] = [];

    for (const targetMonth of testMonths) {
        const [year, mon] = targetMonth.split("-").map(Number);
        // Reference date = last day of month before target
        const refDate = new Date(year, mon - 1, 0, 12, 0, 0);
        const history = allTxs.filter(tx => tx.date < targetMonth);
        if (history.length < 50) continue;

        const actual = actualsByMonth.get(targetMonth);
        if (!actual) continue;

        const forecast = generateDeterministicForecast(history, refDate, scenario.profile);

        // Sum predicted totals for target month
        let predExpenses = 0, predIncome = 0;
        for (const tx of forecast.predicted_transactions) {
            if (monthKey(tx.date) !== targetMonth) continue;
            if (tx.amount < 0) predExpenses += Math.abs(tx.amount);
            else predIncome += tx.amount;
        }

        const expErr = safePctErr(predExpenses, actual.expenses);
        const incErr = safePctErr(predIncome, actual.income);

        if (actual.expenses > 50) expErrs.push(expErr);
        if (actual.income > 50) incErrs.push(incErr);
        monthResults.push({
            month: targetMonth,
            predExp: predExpenses, actExp: actual.expenses,
            predInc: predIncome, actInc: actual.income,
            expErr, incErr,
        });
    }

    const avgExp = expErrs.length > 0 ? expErrs.reduce((a, b) => a + b, 0) / expErrs.length : 0;
    const avgInc = incErrs.length > 0 ? incErrs.reduce((a, b) => a + b, 0) / incErrs.length : 0;
    summaryTable.push({ name: scenario.name, avgExp, avgInc, combined: (avgExp + avgInc) / 2 });

    console.log(`\n📊 ${scenario.name}`);
    console.log(`   Expense MAPE: ${avgExp.toFixed(1)}%  |  Income MAPE: ${avgInc.toFixed(1)}%  |  Combined: ${((avgExp + avgInc) / 2).toFixed(1)}%`);
    console.log(`   ${"Month".padEnd(10)} ${"Pred Exp".padStart(10)} ${"Act Exp".padStart(10)} ${"Exp Err".padStart(8)} ${"Pred Inc".padStart(10)} ${"Act Inc".padStart(10)} ${"Inc Err".padStart(8)}`);
    for (const r of monthResults) {
        console.log(`   ${r.month.padEnd(10)} ${("$" + r.predExp.toFixed(0)).padStart(10)} ${("$" + r.actExp.toFixed(0)).padStart(10)} ${(r.expErr.toFixed(1) + "%").padStart(8)} ${("$" + r.predInc.toFixed(0)).padStart(10)} ${("$" + r.actInc.toFixed(0)).padStart(10)} ${(r.incErr.toFixed(1) + "%").padStart(8)}`);
    }
}

console.log("\n\n" + "=".repeat(90));
console.log("SUMMARY — All Scenarios");
console.log("=".repeat(90));
console.log(`${"Scenario".padEnd(50)} ${"Exp MAPE".padStart(10)} ${"Inc MAPE".padStart(10)} ${"Combined".padStart(10)}`);
console.log("-".repeat(90));
for (const s of summaryTable) {
    const expStr = s.avgExp.toFixed(1) + "%";
    const incStr = s.avgInc.toFixed(1) + "%";
    const combStr = s.combined.toFixed(1) + "%";
    console.log(`${s.name.padEnd(50)} ${expStr.padStart(10)} ${incStr.padStart(10)} ${combStr.padStart(10)}`);
}
