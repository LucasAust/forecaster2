/**
 * Test script: run the forecast engine against the real Chase CSV data
 * Usage: npx tsx scripts/test-forecast.ts
 */

import fs from "fs";
import path from "path";
import { generateDeterministicForecast, buildFinancialProfile } from "../lib/forecast-engine";
import { inferCategory } from "../lib/categories";
import type { Transaction } from "../types";

// ── Helper: parse a quoted CSV line safely ────────────────────────────────────
function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === "," && !inQuote) { result.push(cur.trim()); cur = ""; continue; }
        cur += ch;
    }
    result.push(cur.trim());
    return result;
}

// ── Parse Chase 7885 (Credit Card) ───────────────────────────────────────────
// Format: Transaction Date,Post Date,Description,Category,Type,Amount,Memo
// Sign convention: Sale=negative (expense), Payment/Adjustment=positive (to convert → Plaid: * -1)
function parseChase7885(filePath: string): Transaction[] {
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").slice(1);
    const txs: Transaction[] = [];
    lines.forEach((line, i) => {
        const cols = parseCsvLine(line);
        if (cols.length < 6) return;
        const [txDate, , description, chaseCategory, type, amountStr] = cols;
        const dateMatch = txDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!dateMatch) return;
        const date = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;
        const chaseAmount = parseFloat(amountStr);
        if (isNaN(chaseAmount)) return;

        // Chase CC sign: Sale = negative (expense), Payment = positive (paying the CC)
        // Plaid sign: positive = expense, negative = income
        // So: plaidAmount = chaseAmount * -1
        const plaidAmount = chaseAmount * -1;

        // Mark CC payments as Transfer so they don't bloat spending
        const isPayment = type === "Payment" || type === "Adjustment";
        const category: string[] = isPayment ? ["Transfer"] : [chaseCategory || ""];

        txs.push({
            transaction_id: `7885-${i}`,
            account_id: "chase-7885",
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

// ── Parse Chase 6656 (Checking Account) ──────────────────────────────────────
// Format: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
// Sign convention: CREDIT=positive (money in), DEBIT=negative (money out)
// Plaid: positive=expense, negative=income → plaidAmount = chaseAmount * -1
function parseChase6656(filePath: string): Transaction[] {
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").slice(1);
    const txs: Transaction[] = [];
    lines.forEach((line, i) => {
        const cols = parseCsvLine(line);
        if (cols.length < 5) return;
        const [details, postDate, description, amountStr, type] = cols;
        const dateMatch = postDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!dateMatch) return;
        const date = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;
        const chaseAmount = parseFloat(amountStr);
        if (isNaN(chaseAmount)) return;

        const plaidAmount = chaseAmount * -1; // flip to Plaid convention

        // Classify transfer types that should never be counted as spending
        const isTransfer = type === "LOAN_PMT" || type === "ACCT_XFER";
        const isInvestment = /robinhood|schwab/i.test(description);
        const isRent = /bilt|yardi/i.test(description);
        const isUtility = /dominion energy/i.test(description);
        const isVenmoCashout = /venmo.*cashout/i.test(description);
        const isStudentLoan = /dept education|student ln/i.test(description);

        let category: string[];
        if (isTransfer || isInvestment) category = ["Transfer"];
        else if (isStudentLoan) category = ["Transfer"]; // debt payment ≠ education spending
        else if (isRent) category = ["Housing"];
        else if (isUtility) category = ["Utilities"];
        else if (isVenmoCashout) category = ["Income"]; // cashing out Venmo balance = real money in
        else category = [""]; // let inferCategory handle it

        txs.push({
            transaction_id: `6656-${i}`,
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

const file7885 = path.join(process.cwd(), "Chase7885_Activity20240224_20260224_20260224.CSV");
const file6656 = path.join(process.cwd(), "Chase6656_Activity_20260224.CSV");

const cc = parseChase7885(file7885);
const checking = parseChase6656(file6656);
const rawTransactions = [...cc, ...checking];

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  FORECAST ENGINE TEST — ${new Date().toISOString().slice(0, 10)}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
console.log(`Chase 7885 (CC) rows:       ${cc.length}`);
console.log(`Chase 6656 (Checking) rows: ${checking.length}`);
console.log(`Total input:                ${rawTransactions.length}`);

// ── Run Analysis ──────────────────────────────────────────────────────────────
const analysis = buildFinancialProfile(rawTransactions);

console.log(`Cleaned / deduped: ${analysis.total_transactions_analyzed}`);
console.log(`History span: ${analysis.history_span_days} days`);
console.log(`\n── RECURRING SERIES (${analysis.recurring_series.length}) ──────────────────────────────`);

let incomeCount = 0;
let expenseCount = 0;

for (const s of analysis.recurring_series) {
    const type = s.type === "income" ? "💰 INCOME " : "🔴 EXPENSE";
    const sign = s.type === "income" ? "+" : "-";
    console.log(
        `  ${type}  ${s.merchant.padEnd(36)} $${sign}${Math.abs(s.typical_amount).toFixed(2).padStart(8)}  ${s.cadence.padEnd(10)}  [${s.confidence}]`
    );
    if (s.type === "income") incomeCount++; else expenseCount++;
}

console.log(`\n  → ${incomeCount} income series, ${expenseCount} expense series`);

console.log(`\n── DISCRETIONARY PATTERNS (${analysis.discretionary_patterns.length}) ──────────────────────────`);
for (const p of analysis.discretionary_patterns) {
    console.log(
        `  📊  ${p.category.padEnd(20)} avg $${Math.abs(p.recent_avg_amount).toFixed(2).padStart(7)}  ~${p.avg_weekly_count.toFixed(2)}x/week`
    );
}

// ── Generate Forecast ─────────────────────────────────────────────────────────
const forecast = generateDeterministicForecast(rawTransactions);
const predicted = forecast.predicted_transactions;

const incomes = predicted.filter(t => t.type === "income");
const expenses = predicted.filter(t => t.type === "expense");
const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
const totalExpenses = expenses.reduce((s, t) => s + Math.abs(t.amount), 0);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  90-DAY FORECAST SUMMARY (${predicted.length} transactions)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Projected income:   +$${totalIncome.toFixed(2)}`);
console.log(`  Projected expenses: -$${totalExpenses.toFixed(2)}`);
console.log(`  Net cash flow:       $${(totalIncome - totalExpenses).toFixed(2)}`);
console.log(`\n── INCOME TRANSACTIONS ────────────────────────────────────────`);
for (const t of incomes.slice(0, 30)) {
    console.log(`  ${t.date}  💰 ${t.merchant.padEnd(40)} +$${t.amount.toFixed(2)}  [${t.confidence_score}]`);
}
if (incomes.length > 30) console.log(`  ... and ${incomes.length - 30} more`);

console.log(`\n── EXPENSE TRANSACTIONS (first 30) ────────────────────────────`);
for (const t of expenses.slice(0, 30)) {
    console.log(`  ${t.date}  🔴 ${t.merchant.padEnd(40)} -$${Math.abs(t.amount).toFixed(2)}  [${t.confidence_score}]`);
}
if (expenses.length > 30) console.log(`  ... and ${expenses.length - 30} more`);

// ── Budget Simulation (what the Budget page would show for Feb 2026) ──────────
const MONTHLY_TARGET = 3000;
const now = new Date();
const curMonth = "2026-02"; // test against February 2026
const mtdExpenses = rawTransactions.filter((tx) => {
    const isThisMonth = tx.date.startsWith(curMonth);
    const isExpense = tx.amount > 0; // Plaid positive = expense
    const cat = inferCategory(tx);
    return isThisMonth && isExpense && cat !== "Transfer";
});

const byCategory: Record<string, number> = {};
let mtdTotal = 0;
for (const tx of mtdExpenses) {
    const cat = inferCategory(tx);
    byCategory[cat] = (byCategory[cat] || 0) + tx.amount;
    mtdTotal += tx.amount;
}

const projExpenses = predicted.filter(t => {
    const isThisMonth = t.date.startsWith(curMonth);
    return isThisMonth && (t.type === "expense" || t.amount < 0) && inferCategory(t) !== "Transfer";
});
const projTotal = projExpenses.reduce((s, t) => s + Math.abs(t.amount), 0);
const totalProjected = mtdTotal + projTotal;
const pct = Math.round((totalProjected / MONTHLY_TARGET) * 100);
const topCat = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0];

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  BUDGET SIMULATION — February 2026 (target $${MONTHLY_TARGET})`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Actual MTD spend (excl transfers): $${mtdTotal.toFixed(2)}`);
console.log(`  Remaining projected (rest of Feb):  $${projTotal.toFixed(2)}`);
console.log(`  Total projected spend:              $${totalProjected.toFixed(2)}  (${pct}% of $${MONTHLY_TARGET} target)`);
if (topCat) console.log(`  Top category: ${topCat[0]} ($${topCat[1].toFixed(2)})`);
console.log(`\n── Feb MTD by category ────────────────────────────────────────`);
Object.entries(byCategory).sort((a,b) => b[1]-a[1]).forEach(([cat, amt]) => {
    const bar = "█".repeat(Math.round(amt / 50));
    console.log(`  ${cat.padEnd(22)} $${amt.toFixed(2).padStart(8)}  ${bar}`);
});

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
