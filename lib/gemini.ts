import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Transaction, Forecast, AISuggestion, ChatMessage } from "@/types";
import { buildFinancialProfile, validateForecast } from "./forecast-engine";

/** Singleton — reuse across requests in the same process */
let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    if (!_genAI) _genAI = new GoogleGenerativeAI(apiKey);
    return _genAI;
}

export const geminiClient = {
    generateForecast: async (history: Transaction[]): Promise<Forecast> => {
        const genAI = getGenAI();

        // ── Step 1: Pre-compute patterns in TypeScript (LLMs are bad at math) ──
        const profile = buildFinancialProfile(history);

        // ── Step 2: Deterministic model config ──
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
            },
        });

        // ── Step 3: Focused, data-rich prompt ──
        const prompt = `You are a precision financial forecasting engine. Generate an exact transaction schedule for the next 90 days.

## Context
- Today: ${profile.analysis_date}
- Forecast window: ${profile.forecast_start} to ${profile.forecast_end}
- History: ${profile.total_transactions_analyzed} transactions over ${profile.history_span_days} days

## Pre-Computed Recurring Series (HIGHEST PRIORITY)
These patterns are statistically detected from the user's history. Schedule each one on the correct dates within the window.
${JSON.stringify(profile.recurring_series, null, 2)}

## Discretionary Spending Patterns
Non-recurring spending by category. Distribute these realistically across the 90-day window at the historical frequency.
${JSON.stringify(profile.discretionary_patterns, null, 2)}

## Monthly Financial Summary
${JSON.stringify(profile.monthly_averages)}

## Recent Transactions (for edge-case detection)
Look for any patterns our automated detection might have missed (new subscription starting, quarterly bill, etc.).
${JSON.stringify(profile.recent_transactions)}

## Scheduling Rules

### Recurring (Primary Task)
1. For each recurring series, compute the NEXT occurrence after \`last_occurrence\` using the \`cadence\` and \`anchor_day\`.
2. Continue scheduling at that cadence until ${profile.forecast_end}.
3. Monthly items: use the \`anchor_day\` as day-of-month (e.g. anchor_day=15 → the 15th each month).
4. Weekly items: use the \`anchor_day\` as day-of-week index (0=Sun … 6=Sat).
5. Weekend adjustment: if a recurring date falls on Saturday, shift to Friday. If Sunday, shift to Monday.
6. Fixed-amount items (\`amount_is_fixed\`=true): use the EXACT \`typical_amount\`.
7. Variable items: use \`typical_amount\` ±5%.
8. Use the exact \`merchant\` name and \`category\` from the series data.

### Discretionary
1. For each category, generate \`avg_weekly_count\` transactions per week spread across the window.
2. Rotate through the \`typical_merchants\` list for that category.
3. Amount = \`avg_amount\` ±20% variance.
4. Slightly reduce frequency on weekends for work-related categories (e.g. Food & Drink during lunch).
5. Use natural spacing — not all on the same day of every week.

### Edge Cases
- Check recent_transactions for patterns NOT in recurring_series (e.g. a brand-new subscription, a quarterly bill).
- If you find a likely upcoming transaction, include it with confidence "low".

## DO NOT
- Invent merchants or categories absent from the input data.
- Generate dates outside ${profile.forecast_start} to ${profile.forecast_end}.
- Include inter-account transfers.
- Duplicate the same merchant + date + amount combination.
- Deviate from the pre-computed recurring schedule unless correcting for weekends.

## Output Schema
{
  "forecast_period_days": 90,
  "predicted_transactions": [
    {
      "date": "YYYY-MM-DD",
      "day_of_week": "Monday",
      "merchant": "Merchant Name",
      "amount": -29.99,
      "category": "Category Name",
      "type": "expense",
      "confidence_score": "high"
    }
  ]
}

- amount: negative = expense, positive = income.
- type: "expense" or "income".
- confidence_score: "high" for recurring bills/income, "medium" for discretionary estimates, "low" for edge cases.
- Sort by date ascending.`;

        // ── Step 4: Call Gemini with retries ──
        let retries = 3;
        while (retries > 0) {
            try {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                const rawForecast: Forecast = JSON.parse(text);

                // ── Step 5: Validate & clean the output ──
                return validateForecast(rawForecast);
            } catch (error: unknown) {
                console.error(`Gemini API Error (Attempt ${4 - retries}/3):`, error);
                const err = error as { status?: number; message?: string };
                if (err.status === 503 || err.message?.includes('overloaded') || error instanceof SyntaxError) {
                    retries--;
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, 3 - retries - 1)));
                } else {
                    throw error;
                }
            }
        }
        throw new Error("Failed to generate forecast after retries");
    },
    generateSuggestions: async (history: Transaction[], forecast: Forecast): Promise<{ suggestions: AISuggestion[] }> => {
        const genAI = getGenAI();
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
            },
        });

        const prompt = `
        You are a financial advisor. Analyze the following transaction history (past) and forecast (future).
        Identify 3 specific, actionable insights or savings opportunities.
        Focus on:
        1. Recurring subscriptions that could be cancelled.
        2. Spending categories that are increasing.
        3. Upcoming large bills to prepare for.
        
        Recent History: ${JSON.stringify(history.slice(0, 50))}
        Forecast: ${JSON.stringify(forecast?.predicted_transactions?.slice(0, 20) || [])}
        
        Output JSON only:
        {
            "suggestions": [
                {
                    "title": "Short generic title (e.g. 'Reduce Dining')",
                    "message": "Specific advice with numbers (e.g. 'You spent $400 on dining, projected to be $500 next month.')",
                    "type": "saving" | "warning" | "insight"
                }
            ]
        }
        `;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            return JSON.parse(text);
        } catch (error) {
            console.error("Gemini Suggestions Error:", error);
            throw error;
        }
    },
    async generateChatResponse(messages: ChatMessage[], context: Record<string, unknown>): Promise<string> {
        if (!messages || messages.length === 0) {
            return "Please send a message to get started.";
        }

        const genAI = getGenAI();
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Construct a system instruction with context
        const systemPrompt = `
        You are a financial scenario assistant. You help the user understand the impact of potential financial decisions.
        
        User Context:
        - Current Balance (approx): $${context.balance ?? 'Unknown'}
        - Monthly Budget Target: $${context.monthly_budget ?? 'Not set'}
        - Recent Transactions: ${JSON.stringify((context.history as unknown[] || []).slice(0, 20))}
        - Forecasted Transactions (Next 30 days): ${JSON.stringify((context.forecast as unknown[] || []).slice(0, 20))}

        Rules:
        1. Be helpful, concise, and realistic.
        2. references specific numbers from the user's data when possible.
        3. If asked about "affordability", check if the purchase would make their balance go negative or exceed their budget.
        4. Keep answers short (under 3 sentences) unless asked for details.
        5. Do not give official financial advice (e.g., investing in stocks). Stick to cash flow and budgeting.
        `;

        // Transform messages to Gemini format
        // Gemini expects: { role: 'user' | 'model', parts: [{ text: string }] }
        // Input messages: { role: 'user' | 'assistant', content: string }
        const history = messages.slice(0, -1).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

        const lastMessage = messages[messages.length - 1].content;

        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] }, // Seed context as first message
                { role: 'model', parts: [{ text: "Understood. I am ready to help with your financial scenarios using the provided data." }] },
                ...history
            ]
        });

        try {
            const result = await chat.sendMessage(lastMessage);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error("Gemini Chat Error:", error);
            return "I'm having trouble connecting to the financial brain right now. Please try again.";
        }
    }
};
