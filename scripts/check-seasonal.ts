import fs from "fs";
import { buildFinancialProfile } from "../lib/forecast-engine";
import type { Transaction } from "../types";

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

const allTxs = [
    ...fs.readFileSync("Chase7885_Activity20240224_20260224_20260224.CSV","utf-8").trim().split("\n").slice(1).map((line,i) => {
        const c = parseCsvLine(line); if(c.length<6) return null;
        const date = toISODate(c[0]); const amt = parseFloat(c[5]);
        if(!date || isNaN(amt)) return null;
        return {transaction_id:`7885-${i}`,account_id:"chase-7885",amount:amt*-1,date,name:c[2],merchant_name:c[2],category:c[4]==="Payment"||c[4]==="Adjustment"?["Transfer"]:[c[3]||""],pending:false,logo_url:null} as Transaction;
    }).filter(Boolean) as Transaction[],
    ...fs.readFileSync("Chase6656_Activity_20260224.CSV","utf-8").trim().split("\n").slice(1).map((line,i) => {
        const c = parseCsvLine(line); if(c.length<5) return null;
        const date = toISODate(c[1]); const amt = parseFloat(c[3]);
        if(!date || isNaN(amt)) return null;
        const isXfer = c[4]==="LOAN_PMT"||c[4]==="ACCT_XFER";
        const isInv = /robinhood|schwab/i.test(c[2]);
        const isLoan = /dept education|student ln/i.test(c[2]);
        let cat: string[];
        if(isXfer||isInv||isLoan) cat=["Transfer"];
        else if(/bilt|yardi/i.test(c[2])) cat=["Housing"];
        else if(/dominion energy/i.test(c[2])) cat=["Utilities"];
        else if(/venmo.*cashout/i.test(c[2])) cat=["Income"];
        else cat=[""];
        return {transaction_id:`6656-${i}`,account_id:"chase-6656",amount:amt*-1,date,name:c[2],merchant_name:c[2],category:cat,pending:false,logo_url:null} as Transaction;
    }).filter(Boolean) as Transaction[],
].sort((a,b) => a.date.localeCompare(b.date));

// Compute actual monthly expenses/income
const byMonth = new Map<string, { expenses: number; income: number }>();
for (const tx of allTxs) {
    if (tx.pending) continue;
    const key = tx.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { expenses: 0, income: 0 });
    const m = byMonth.get(key)!;
    // Plaid: positive = money out, negative = money in
    if (tx.amount > 0 && !["Transfer"].includes((tx.category as string[])?.[0] || "")) {
        m.expenses += tx.amount;
    } else if (tx.amount < 0) {
        m.income += Math.abs(tx.amount);
    }
}

console.log("Month | Expenses | Income");
for (const [month, {expenses, income}] of [...byMonth.entries()].sort()) {
    console.log(`${month} | $${expenses.toFixed(0).padStart(6)} | $${income.toFixed(0).padStart(6)}`);
}
