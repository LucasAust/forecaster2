/**
 * Deep diagnostic: understand WHY expenses are over-predicted in bad months
 * and WHY income is under-predicted.
 */
import fs from "fs";
import { generateDeterministicForecast, buildFinancialProfile } from "../lib/forecast-engine";
import type { Transaction } from "../types";

// --- CSV Parsers (copied from audit) ---
function parseCsvLine(line: string): string[] {
    const out: string[] = []; let current = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { inQuote = !inQuote; continue; }
        if (char === ',' && !inQuote) { out.push(current.trim()); current = ""; continue; }
        current += char;
    }
    out.push(current.trim()); return out;
}
function toISODate(mmddyyyy: string): string | null {
    const m = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}
function parseChase7885(fp: string): Transaction[] {
    return fs.readFileSync(fp,"utf-8").trim().split("\n").slice(1).map((line,i) => {
        const c = parseCsvLine(line); if(c.length<6) return null;
        const date = toISODate(c[0]); const amt = parseFloat(c[5]);
        if(!date || isNaN(amt)) return null;
        const isPay = c[4]==="Payment"||c[4]==="Adjustment";
        return {transaction_id:`7885-${i}`,account_id:"chase-7885",amount:amt*-1,date,name:c[2],merchant_name:c[2],category:isPay?["Transfer"]:[c[3]||""],pending:false,logo_url:null} as Transaction;
    }).filter(Boolean) as Transaction[];
}
function parseChase6656(fp: string): Transaction[] {
    return fs.readFileSync(fp,"utf-8").trim().split("\n").slice(1).map((line,i) => {
        const c = parseCsvLine(line); if(c.length<5) return null;
        const date = toISODate(c[1]); const amt = parseFloat(c[3]);
        if(!date || isNaN(amt)) return null;
        const isXfer = c[4]==="LOAN_PMT"||c[4]==="ACCT_XFER";
        const isInv = /robinhood|schwab/i.test(c[2]);
        const isLoan = /dept education|student ln/i.test(c[2]);
        const isRent = /bilt|yardi/i.test(c[2]);
        const isUtil = /dominion energy/i.test(c[2]);
        const isVenmo = /venmo.*cashout/i.test(c[2]);
        let cat: string[];
        if(isXfer||isInv||isLoan) cat=["Transfer"];
        else if(isRent) cat=["Housing"];
        else if(isUtil) cat=["Utilities"];
        else if(isVenmo) cat=["Income"];
        else cat=[""];
        return {transaction_id:`6656-${i}`,account_id:"chase-6656",amount:amt*-1,date,name:c[2],merchant_name:c[2],category:cat,pending:false,logo_url:null} as Transaction;
    }).filter(Boolean) as Transaction[];
}

const allTxs = [
    ...parseChase7885("Chase7885_Activity20240224_20260224_20260224.CSV"),
    ...parseChase6656("Chase6656_Activity_20260224.CSV"),
].sort((a,b) => a.date.localeCompare(b.date));

// Test a bad month and a good month
for (const testMonth of ["2025-03", "2025-10", "2025-01", "2025-07"]) {
    const refStr = `${testMonth}-01`;
    const refDate = new Date(refStr + "T12:00:00");
    const history = allTxs.filter(tx => tx.date < refStr);
    
    if (history.length < 50) { console.log(`${testMonth}: not enough history`); continue; }
    
    const forecast = generateDeterministicForecast(history, refDate);
    const profile = buildFinancialProfile(history, refDate);
    
    // Forecast predictions for THIS month (the first ~30 days of the 90-day forecast)
    const endOfMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
    const endStr = endOfMonth.toISOString().slice(0, 10);
    const monthPreds = forecast.predicted_transactions.filter(tx => tx.date >= refStr && tx.date <= endStr);
    
    // Actual transactions in this month
    const nextMonthStr = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1).toISOString().slice(0, 7);
    const actualTxs = allTxs.filter(tx => tx.date.startsWith(testMonth));
    
    // Plaid convention: positive = money out (expense), negative = money in (income)
    const actualExpense = actualTxs.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);
    const actualIncome = actualTxs.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0);
    
    // Predicted: our convention: negative = expense, positive = income
    const predExpense = monthPreds.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const predIncome = monthPreds.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);
    
    const expErr = actualExpense > 0 ? ((predExpense - actualExpense) / actualExpense * 100).toFixed(1) : "N/A";
    const incErr = actualIncome > 0 ? ((predIncome - actualIncome) / actualIncome * 100).toFixed(1) : "N/A";
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${testMonth} — Expense error: ${expErr}% | Income error: ${incErr}%`);
    console.log(`Actual expense: $${actualExpense.toFixed(0)} | Predicted: $${predExpense.toFixed(0)}`);
    console.log(`Actual income: $${actualIncome.toFixed(0)} | Predicted: $${predIncome.toFixed(0)}`);
    console.log(`Recurring series: ${profile.recurring_series.length}`);
    console.log(`Discretionary patterns: ${profile.discretionary_patterns.length}`);
    console.log(`Monthly avg expenses: $${profile.monthly_averages.total_expenses}`);
    console.log(`Monthly avg income: $${profile.monthly_averages.total_income}`);
    
    // Predicted expense by category
    const predByCat = new Map<string, { amount: number; count: number }>();
    for (const tx of monthPreds.filter(t => t.amount < 0)) {
        const entry = predByCat.get(tx.category) || { amount: 0, count: 0 };
        entry.amount += Math.abs(tx.amount);
        entry.count++;
        predByCat.set(tx.category, entry);
    }
    console.log("\nPredicted expense breakdown:");
    for (const [cat, { amount, count }] of [...predByCat.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
        console.log(`  ${cat}: $${amount.toFixed(0)} (${count} txs)`);
    }
    
    // Recurring series details
    console.log("\nRecurring series (expenses):");
    for (const s of profile.recurring_series.filter(r => r.type === "expense").slice(0, 10)) {
        console.log(`  ${s.merchant}: $${Math.abs(s.recent_amount).toFixed(0)}/${s.cadence} [${s.confidence}]`);
    }
    
    console.log("\nRecurring series (income):");
    for (const s of profile.recurring_series.filter(r => r.type === "income")) {
        console.log(`  ${s.merchant}: $${s.recent_amount.toFixed(0)}/${s.cadence} [${s.confidence}]`);
    }
}
