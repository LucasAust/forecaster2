/**
 * Gemini Income Predictor
 * 
 * Uses Gemini 2.0 Flash specifically for income prediction.
 * The deterministic engine handles expenses well, but income
 * needs LLM pattern recognition for:
 *   - Identifying lumpy/sporadic income patterns
 *   - Detecting regime changes in earning patterns
 *   - Understanding seasonal business cycles
 *   - Recognizing that "Venmo cashouts" = freelance income
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Transaction } from "@/types";

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    if (!_genAI) _genAI = new GoogleGenerativeAI(apiKey);
    return _genAI;
}

interface IncomeMonthly {
    month: string;
    total: number;
    sources: { name: string; amount: number; count: number }[];
}

function buildIncomeHistory(transactions: Transaction[], referenceDate: Date): IncomeMonthly[] {
    const byMonth = new Map<string, Map<string, { amount: number; count: number }>>();

    for (const tx of transactions) {
        if (tx.pending) continue;
        // Plaid: negative = income
        if (tx.amount >= 0) continue;

        const cat = Array.isArray(tx.category) ? tx.category[0] : tx.category;
        if (cat === "Transfer") continue;

        const month = tx.date.substring(0, 7);
        const name = (tx.merchant_name || tx.name || "Unknown").substring(0, 40);

        if (!byMonth.has(month)) byMonth.set(month, new Map());
        const sources = byMonth.get(month)!;
        if (!sources.has(name)) sources.set(name, { amount: 0, count: 0 });
        const s = sources.get(name)!;
        s.amount += Math.abs(tx.amount);
        s.count++;
    }

    const refMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;

    return [...byMonth.entries()]
        .filter(([m]) => m < refMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, sources]) => ({
            month,
            total: [...sources.values()].reduce((s, v) => s + v.amount, 0),
            sources: [...sources.entries()]
                .map(([name, data]) => ({ name, amount: data.amount, count: data.count }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 5),
        }));
}

/**
 * Ask Gemini to predict income for the next 3 months.
 * Returns per-month dollar predictions.
 */
export async function predictIncomeWithGemini(
    transactions: Transaction[],
    referenceDate: Date,
    months: number = 3
): Promise<{ predictions: number[]; reasoning: string } | null> {
    if (!process.env.GEMINI_API_KEY) return null;

    try {
        const genAI = getGenAI();
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
            },
        });

        const history = buildIncomeHistory(transactions, referenceDate);
        const last12 = history.slice(-12);

        // Build forecast month names
        const forecastMonths = Array.from({ length: months }, (_, i) => {
            const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1 + i, 1);
            return d.toLocaleString("en-US", { month: "long", year: "numeric" });
        });

        // Build the income summary for Gemini
        const monthlyData = last12.map(m => {
            const topSources = m.sources.slice(0, 3).map(s => 
                `${s.name}: $${s.amount.toFixed(0)} (${s.count}x)`
            ).join(", ");
            return `${m.month}: $${m.total.toFixed(0)} [${topSources}]`;
        }).join("\n");

        const prompt = `You are an expert at predicting personal income from transaction patterns.

MONTHLY INCOME HISTORY (with top sources each month):
${monthlyData}

IMPORTANT OBSERVATIONS about this person's income:
- Income is HIGHLY VARIABLE — some months are $300-700, others spike to $5000+
- Big spikes are RARE (roughly 1 in 5 months) — do NOT predict spikes unless there's a clear pattern
- "Venmo Cashout" entries are freelance/gig income being cashed out
- "Remote Online Deposit" entries are check deposits (sporadic client payments)
- Most months, real income is $300-800
- After a high-income month, the next month tends to be LOW (negative autocorrelation)

TASK: Predict total income for: ${forecastMonths.join(", ")}

RULES:
1. For EACH month, predict the most likely income amount
2. Be CONSERVATIVE — predict the typical/normal level unless you see a strong reason for a spike
3. Look at seasonal patterns (does this calendar month tend to be high or low?)
4. Look at the most recent 2-3 months for momentum
5. If the previous month was unusually high (>$2000), predict BELOW average for the next month
6. Do NOT average in the spike months — they're outliers. Predict the NORMAL level.

Return ONLY this JSON:
{
  "predictions": [month1_dollars, month2_dollars, month3_dollars],
  "reasoning": "brief explanation of your prediction logic"
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const parsed = JSON.parse(text) as { predictions: number[]; reasoning: string };

        if (!Array.isArray(parsed.predictions) || parsed.predictions.length !== months) {
            return null;
        }

        return parsed;
    } catch (error) {
        console.error("Gemini income prediction failed:", error);
        return null;
    }
}
