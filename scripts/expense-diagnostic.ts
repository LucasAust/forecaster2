import fs from "fs";
import { generateDeterministicForecast } from "../lib/forecast-engine";
import type { Transaction } from "../types";

// Reuse CSV parsing from the audit script
function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { inQuote = !inQuote; continue; }
        if (char === ',' && !inQuote) { out.push(current.trim()); current = ""; continue; }
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
    return lines.map(line => {
        const cols = parseCsvLine(line);
        if (cols.length < 6) return null;
        const date = toISODate(cols[1]);
        if (!date) return null;
        const amount = parseFloat(cols[4]);
        if (isNaN(amount)) return null;
        return { date, name: cols[2], merchant_name: cols[2], amount: -amount, pending: false, category: ["Other"] } as Transaction;
    }).filter(Boolean) as Transaction[];
}
function parseChase6656(filePath: string): Transaction[] {
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").slice(1);
    return lines.map(line => {
        const cols = parseCsvLine(line);
        if (cols.length < 6) return null;
        const date = toISODate(cols[1]);
        if (!date) return null;
        const amount = parseFloat(cols[4]);
        if (isNaN(amount)) return null;
        return { date, name: cols[2], merchant_name: cols[2], amount: -amount, pending: false, category: ["Other"] } as Transaction;
    }).filter(Boolean) as Transaction[];
}

const allTxs = [
    ...parseChase7885("/Users/lucasaust/forecaster2/Chase7885_Activity20240224_20260224_20260224.CSV"),
    ...parseChase6656("/Users/lucasaust/forecaster2/Chase6656_Activity_20260224.CSV"),
].sort((a, b) => a.date.localeCompare(b.date));

// Run forecast from 2025-09-01 perspective (one of the worst months at 30.3%)
// and 2025-10-01 (one of the best at 2.6%)
for (const testMonth of ["2025-03", "2025-10"]) {
    const refDate = new Date(`${testMonth}-01T12:00:00`);
    const historyBefore = allTxs.filter(tx => tx.date < testMonth + "-01");
    const forecast = generateDeterministicForecast(historyBefore, refDate);
    
    // Get first month of forecast predictions
    const nextMonth = new Date(refDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 7);
    // Actually the forecast starts from day after refDate, so the first month IS the testMonth
    const forecastMonth = testMonth;
    
    const monthPredictions = forecast.predicted_transactions.filter(tx => tx.date.startsWith(forecastMonth));
    
    // Actual transactions in that month
    const actualMonth = allTxs.filter(tx => tx.date.startsWith(forecastMonth));
    const actualExpenses = actualMonth.filter(tx => -tx.amount < 0).reduce((s, tx) => s + tx.amount, 0); // Plaid: positive = expense
    const actualIncome = actualMonth.filter(tx => -tx.amount > 0).reduce((s, tx) => s - tx.amount, 0);
    
    const predExpenses = monthPredictions.filter(tx => tx.amount < 0);
    const predIncome = monthPredictions.filter(tx => tx.amount > 0);
    
    console.log(`\n=== ${testMonth} ===`);
    console.log(`Actual expenses (Plaid positive = money out): $${actualMonth.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0).toFixed(0)}`);
    console.log(`Actual income (Plaid negative = money in): $${actualMonth.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0).toFixed(0)}`);
    console.log(`Predicted expenses: $${Math.abs(predExpenses.reduce((s, tx) => s + tx.amount, 0)).toFixed(0)} (${predExpenses.length} txs)`);
    console.log(`Predicted income: $${predIncome.reduce((s, tx) => s + tx.amount, 0).toFixed(0)} (${predIncome.length} txs)`);
    
    // Category breakdown of predicted expenses
    const byCat = new Map<string, number>();
    for (const tx of predExpenses) {
        byCat.set(tx.category, (byCat.get(tx.category) || 0) + Math.abs(tx.amount));
    }
    console.log("\nPredicted expense by category:");
    for (const [cat, total] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${cat}: $${total.toFixed(0)}`);
    }
    
    // Category breakdown of actual expenses
    // (rough - Plaid positive amounts are expenses in the CSV)
    const actualByCat = new Map<string, number>();
    for (const tx of actualMonth.filter(t => t.amount > 0)) {
        const name = (tx.merchant_name || tx.name || "").toLowerCase();
        let cat = "Other";
        if (/rent|yardi|bilt|mortgage/i.test(name)) cat = "Housing";
        else if (/grocery|kroger|walmart|target|publix|aldi/i.test(name)) cat = "Groceries";
        else if (/uber|lyft|gas|shell|exxon|bp|chevron|mazda/i.test(name)) cat = "Transport";
        else if (/netflix|spotify|hulu|disney|hbo|apple|google|subscription/i.test(name)) cat = "Entertainment";
        else if (/restaurant|mcdonald|chick|subway|doordash|grubhub/i.test(name)) cat = "Food";
        actualByCat.set(cat, (actualByCat.get(cat) || 0) + tx.amount);
    }
    console.log("\nActual expense by rough category:");
    for (const [cat, total] of [...actualByCat.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${cat}: $${total.toFixed(0)}`);
    }
}
