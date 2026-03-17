import fs from "fs";
import { predictMultiHorizonIncome } from "../lib/multi-horizon-income";
import type { Transaction } from "../types";

function parseCsvLine(line: string): string[] {
    const out: string[] = []; let current = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { inQuote = !inQuote; continue; } if (c === "," && !inQuote) { out.push(current.trim()); current = ""; continue; } current += c; } out.push(current.trim()); return out;
}
function toISO(d: string) { const [m, dd, y] = d.split("/"); return `${y}-${m.padStart(2, "0")}-${dd.padStart(2, "0")}`; }

const txs: Transaction[] = [];
for (const line of fs.readFileSync("Chase7885_Activity20240224_20260224_20260224.CSV", "utf-8").trim().split("\n").slice(1)) {
    const c = parseCsvLine(line); if (c.length < 6) continue;
    const date = toISO(c[0]); const amt = parseFloat(c[5]); if (!date || isNaN(amt)) continue;
    txs.push({ transaction_id: "a" + txs.length, account_id: "cc", amount: amt * -1, date, name: c[2], merchant_name: c[2], category: c[4] === "Payment" || c[4] === "Adjustment" ? ["Transfer"] : [c[3] || ""], pending: false, logo_url: null });
}
for (const line of fs.readFileSync("Chase6656_Activity_20260224.CSV", "utf-8").trim().split("\n").slice(1)) {
    const c = parseCsvLine(line); if (c.length < 5) continue;
    const date = toISO(c[1]); const amt = parseFloat(c[3]); if (!date || isNaN(amt)) continue;
    const isXfer = c[4] === "LOAN_PMT" || c[4] === "ACCT_XFER"; const isInv = /robinhood|schwab/i.test(c[2]);
    txs.push({ transaction_id: "b" + txs.length, account_id: "chk", amount: amt * -1, date, name: c[2], merchant_name: c[2], category: isXfer || isInv ? ["Transfer"] : /bilt|yardi/i.test(c[2]) ? ["Housing"] : /dominion/i.test(c[2]) ? ["Utilities"] : /venmo.*cashout/i.test(c[2]) ? ["Income"] : [""], pending: false, logo_url: null });
}
txs.sort((a, b) => a.date.localeCompare(b.date));

// Actuals (same method as audit)
const actualIncome = new Map<string, number>();
for (const tx of txs) {
    const cat = Array.isArray(tx.category) ? tx.category[0] : tx.category;
    if (cat === "Transfer") continue;
    if (tx.amount >= 0) continue; // income only (Plaid: negative = income)
    const month = tx.date.substring(0, 7);
    actualIncome.set(month, (actualIncome.get(month) || 0) + Math.abs(tx.amount));
}

// Test each month from Apr-Dec 2025
console.log("MULTI-HORIZON INCOME PREDICTIONS vs ACTUALS\n");
console.log(`${"Month".padEnd(10)} ${"Predicted".padStart(10)} ${"Actual".padStart(10)} ${"Error".padStart(8)}  Signals`);
console.log("-".repeat(90));

const errors: number[] = [];

for (let m = 4; m <= 12; m++) {
    const targetMonth = `2025-${String(m).padStart(2, "0")}`;
    const history = txs.filter(t => t.date < targetMonth);
    const refDate = new Date(2025, m - 1, 0, 12); // Last day of prior month

    const predictions = predictMultiHorizonIncome(history, refDate, 1);
    const pred = predictions[0];
    const actual = actualIncome.get(targetMonth) || 0;

    const err = actual > 0 ? Math.abs(pred.target - actual) / actual * 100 : 0;
    if (actual > 0) errors.push(err);

    const signalStr = pred.signals
        .filter(s => s.target > 0)
        .map(s => `${s.horizon[0].toUpperCase()}:$${s.target.toFixed(0)}(${(s.confidence * 100).toFixed(0)}%)`)
        .join(" ");

    console.log(
        `${targetMonth.padEnd(10)} ${("$" + pred.target.toFixed(0)).padStart(10)} ${("$" + actual.toFixed(0)).padStart(10)} ${(err.toFixed(1) + "%").padStart(8)}  ${signalStr}`
    );
}

const avgErr = errors.reduce((a, b) => a + b, 0) / errors.length;
console.log("-".repeat(90));
console.log(`Average Income MAPE: ${avgErr.toFixed(1)}%`);
