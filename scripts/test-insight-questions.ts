/**
 * Test the insight question generator against real transaction data.
 */
import * as fs from "fs";
import * as path from "path";
import { generateInsightQuestions, buildInsightProfile } from "../lib/insight-questions";
import type { Transaction } from "../types";

function loadCSV(filePath: string): Transaction[] {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.trim().split("\n");
    const header = lines[0].split(",");
    
    return lines.slice(1).map((line, i) => {
        const cols = line.split(",");
        const dateIdx = header.indexOf("Transaction Date") !== -1 ? header.indexOf("Transaction Date") : header.indexOf("Posting Date");
        const descIdx = header.indexOf("Description");
        const amountIdx = header.indexOf("Amount");
        
        return {
            transaction_id: `csv-${i}`,
            account_id: "test",
            amount: parseFloat(cols[amountIdx] || "0"),
            date: formatDate(cols[dateIdx]?.trim() || ""),
            name: cols[descIdx]?.trim() || "Unknown",
            category: null,
            pending: false,
            logo_url: null,
        };
    }).filter(tx => tx.amount !== 0 && tx.date.length === 10);
}

function formatDate(d: string): string {
    // MM/DD/YYYY → YYYY-MM-DD
    const parts = d.split("/");
    if (parts.length === 3) {
        return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
    return d;
}

// Load CSV files
const projectRoot = path.join(__dirname, "..");
const csvFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith(".CSV") || f.endsWith(".csv"));

console.log(`Found ${csvFiles.length} CSV files`);

let allTxs: Transaction[] = [];
for (const f of csvFiles) {
    const txs = loadCSV(path.join(projectRoot, f));
    console.log(`  ${f}: ${txs.length} transactions`);
    allTxs = allTxs.concat(txs);
}

// Sort by date
allTxs.sort((a, b) => a.date.localeCompare(b.date));
console.log(`\nTotal: ${allTxs.length} transactions (${allTxs[0]?.date} to ${allTxs[allTxs.length - 1]?.date})\n`);

// Generate questions
const questions = generateInsightQuestions(allTxs);
console.log(`Generated ${questions.length} insight questions:\n`);

for (const q of questions) {
    console.log(`[${q.priority}] ${q.category.toUpperCase()} — ${q.question}`);
    if (q.context) console.log(`   Context: ${q.context}`);
    for (const opt of q.options) {
        console.log(`   • ${opt.label} (→ ${opt.value})`);
    }
    console.log();
}

// Simulate answers
console.log("=== Simulating user answers ===\n");
const simulatedAnswers = [
    { question_id: "regime_change_expenses", value: "new_normal", answered_at: new Date().toISOString() },
    { question_id: "income_pattern", value: "freelance", answered_at: new Date().toISOString() },
    { question_id: "income_expectation", value: "3000", answered_at: new Date().toISOString() },
    { question_id: "expense_expectation", value: "3000", answered_at: new Date().toISOString() },
];

const profile = buildInsightProfile(simulatedAnswers);
console.log("Insight Profile:", JSON.stringify(profile, null, 2));
