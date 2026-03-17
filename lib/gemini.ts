import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Transaction, Forecast, AISuggestion, ChatMessage, ClarificationQuestion } from "@/types";
import {
    generateDeterministicForecast,
    validateForecast,
    buildFinancialProfile,
} from "./forecast-engine";

/** Singleton — reuse across requests in the same process */
let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    if (!_genAI) _genAI = new GoogleGenerativeAI(apiKey);
    return _genAI;
}

const ALLOWED_CLARIFICATION_CATEGORIES = new Set([
    "Food & Drink", "Shopping", "Travel", "Housing", "Utilities", "Transportation",
    "Health & Wellness", "Entertainment", "Subscriptions", "Transfer", "Income",
    "Business Services", "Personal Care", "Gifts & Donations", "Other",
]);

function sanitizeClarificationQuestions(
    questions: ClarificationQuestion[] | undefined,
    sampleById: Map<string, { name: string; amount: number; date: string }>
): ClarificationQuestion[] {
    if (!Array.isArray(questions)) return [];

    const deduped = new Set<string>();
    const sanitized: ClarificationQuestion[] = [];

    for (const q of questions) {
        const id = typeof q?.transaction_id === "string" ? q.transaction_id.trim() : "";
        if (!id || deduped.has(id)) continue;

        const fallback = sampleById.get(id);
        const txName = (q?.transaction_name || fallback?.name || "Transaction").trim();
        const amount = typeof q?.amount === "number" && Number.isFinite(q.amount)
            ? q.amount
            : (fallback?.amount ?? 0);
        const date = (q?.date || fallback?.date || "").trim();

        const pairs = (q?.options || [])
            .map((option, idx) => ({
                option: (option || "").trim(),
                category: (q?.category_mappings?.[idx] || "").trim(),
            }))
            .filter((pair) => pair.option.length > 0)
            .map((pair) => ({
                option: pair.option,
                category: ALLOWED_CLARIFICATION_CATEGORIES.has(pair.category) ? pair.category : "Other",
            }))
            .slice(0, 4);

        if (pairs.length < 3) continue;

        const questionText = (q?.question || "").trim() || `How should we categorize ${txName}?`;

        sanitized.push({
            transaction_id: id,
            transaction_name: txName,
            amount,
            date,
            question: questionText,
            options: pairs.map((pair) => pair.option),
            category_mappings: pairs.map((pair) => pair.category),
        });

        deduped.add(id);
        if (sanitized.length >= 5) break;
    }

    return sanitized;
}

export const geminiClient = {
    /**
     * Generate a 90-day forecast.
     *
     * Architecture v2:
     *  - Core scheduling is done DETERMINISTICALLY (no LLM).
     *  - Recurring items: mathematically scheduled from detected patterns.
     *  - Discretionary items: statistically sampled from historical distributions.
     *  - Result: faster, cheaper, and far more accurate than LLM scheduling.
     */
    /**
     * Identify up to 5 ambiguous transactions and generate clarification questions.
     *
     * "Ambiguous" means the app isn't confident about the category or intent of the
     * transaction — e.g., generic merchant names, large one-off amounts, transfers
     * that might be income, unusual merchant patterns, etc.
     *
     * Returns at most 5 questions with multiple-choice options so the user can
     * answer quickly without typing.
     */
    generateClarificationQuestions: async (transactions: Transaction[]): Promise<{ questions: ClarificationQuestion[] }> => {
        const genAI = getGenAI();
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
        });

        // Pick up to the 100 most recent transactions to keep the prompt small
        const sample = transactions.slice(0, 100).map(t => ({
            id: t.transaction_id,
            name: t.merchant_name || t.name,
            amount: t.amount,
            date: t.date,
            category: Array.isArray(t.category) ? t.category[0] : t.category,
        }));
        const sampleById = new Map(sample.map((s) => [s.id, { name: s.name || "Transaction", amount: s.amount, date: s.date }]));

        const prompt = `
You are a financial data analyst helping a budgeting app categorize transactions accurately.

Review the following transactions and identify UP TO 5 that are genuinely ambiguous — where it is unclear from the name alone whether they are:
- A regular recurring expense vs. a one-time purchase
- A personal expense vs. a reimbursable business cost
- A transfer to another account vs. actual spending
- Income vs. a refund
- A known subscription vs. an unknown charge

For each ambiguous transaction you find, generate ONE concise multiple-choice clarification question.

Rules:
- Select ONLY transactions that are truly unclear. Skip obvious ones (e.g., "Netflix" = subscription, "Starbucks" = dining).
- Prioritize larger amounts (higher dollar value) and generic merchant names.
- Maximum 5 questions total.
- Each question must have EXACTLY 3-4 short answer options.
- The category_mappings array must parallel the options array, using one of these exact strings:
  "Food & Drink", "Shopping", "Travel", "Housing", "Utilities", "Transportation",
  "Health & Wellness", "Entertainment", "Subscriptions", "Transfer", "Income",
  "Business Services", "Personal Care", "Gifts & Donations", "Other"

Transactions: ${JSON.stringify(sample)}

Output ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "questions": [
    {
      "transaction_id": "<id from the input>",
      "transaction_name": "<merchant or name>",
      "amount": <number>,
      "date": "<YYYY-MM-DD>",
      "question": "<concise question, max 15 words>",
      "options": ["Option A", "Option B", "Option C"],
      "category_mappings": ["Category A", "Category B", "Category C"]
    }
  ]
}

If there are no genuinely ambiguous transactions, return: { "questions": [] }
`;

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const parsed = JSON.parse(text) as { questions: ClarificationQuestion[] };
            const safe = sanitizeClarificationQuestions(parsed.questions, sampleById);
            return { questions: safe };
        } catch (error) {
            console.error("Gemini Clarification Error:", error);
            return { questions: [] };
        }
    },

    generateForecast: async (history: Transaction[], useGeminiRefinement: boolean = true, referenceDate: Date = new Date()): Promise<Forecast> => {
        // Generate the deterministic baseline forecast first
        const baseForecast = generateDeterministicForecast(history, referenceDate);
        
        // If Gemini refinement is disabled or API key not set, return deterministic forecast
        if (!useGeminiRefinement || !process.env.GEMINI_API_KEY) {
            return validateForecast(baseForecast, referenceDate);
        }

        try {
            const genAI = getGenAI();
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: {
                    temperature: 0,
                    responseMimeType: "application/json",
                },
            });

            // Build financial profile summary for Gemini analysis
            const profile = buildFinancialProfileSummary(history);
            const baseline = summarizeBaselineForecast(baseForecast);

            const prompt = `Analyze this financial data and provide monthly adjustment factors for the next 3 months.

Monthly expenses (last 12): [${profile.monthlyExpenses.join(', ')}]
Monthly income (last 12): [${profile.monthlyIncome.join(', ')}]
Detected recurring expenses: ${profile.recurringExpenseSummary}
Current deterministic forecast: $${baseline.monthlyExpenses.toFixed(0)}/mo expenses, $${baseline.monthlyIncome.toFixed(0)}/mo income

Analyze the spending trend and income pattern. Consider:
- Is there a clear trend in expenses (increasing/decreasing/stable)?
- How predictable is the income pattern?
- Are there seasonal factors or regime changes visible?
- Should monthly amounts be adjusted from the baseline?

Return JSON with adjusted monthly targets for the next 3 months:
{
  "expense_multipliers": [month1_multiplier, month2_multiplier, month3_multiplier],
  "income_targets": [month1_target, month2_target, month3_target],
  "reasoning": "brief explanation of adjustments made"
}

Multipliers should be around 1.0 for no change, 0.8-1.2 for moderate adjustments.
Income targets should be actual dollar amounts, not multipliers.`;

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const geminiResponse = JSON.parse(text) as {
                expense_multipliers: number[];
                income_targets: number[];
                reasoning: string;
            };

            // Validate and apply Gemini's refinements
            const refinedForecast = applyGeminiRefinements(
                baseForecast,
                geminiResponse,
                baseline
            );

            console.log(`[Gemini Refinement] Applied adjustments: ${geminiResponse.reasoning}`);
            return validateForecast(refinedForecast, referenceDate);

        } catch (error) {
            console.error("Gemini refinement failed, falling back to deterministic:", error);
            return validateForecast(baseForecast, referenceDate);
        }
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

// Helper functions for Gemini refinement

function buildFinancialProfileSummary(history: Transaction[]) {
    const profile = buildFinancialProfile(history);
    
    // Group transactions by month to build 12-month history
    const monthlyData = new Map<string, { income: number; expenses: number }>();
    
    // Use last 60 transactions for recent context, but build monthly totals from all history
    const cleaned = history
        .filter(tx => !tx.pending && typeof tx.amount === 'number' && tx.amount !== 0)
        .sort((a, b) => a.date.localeCompare(b.date));
        
    for (const tx of cleaned) {
        const month = tx.date.substring(0, 7); // YYYY-MM
        if (!monthlyData.has(month)) {
            monthlyData.set(month, { income: 0, expenses: 0 });
        }
        const data = monthlyData.get(month)!;
        
        // Convert to standard format: positive = income, negative = expense
        const normalizedAmount = tx.amount * -1; // Flip Plaid convention
        
        if (normalizedAmount > 0) {
            data.income += normalizedAmount;
        } else {
            data.expenses += Math.abs(normalizedAmount);
        }
    }
    
    // Get last 12 months of data
    const months = [...monthlyData.keys()].sort().slice(-12);
    const monthlyIncome = months.map(month => monthlyData.get(month)?.income || 0);
    const monthlyExpenses = months.map(month => monthlyData.get(month)?.expenses || 0);
    
    // Summarize recurring expenses
    const topRecurring = profile.recurring_series
        .filter(series => series.type === "expense")
        .sort((a, b) => Math.abs(b.recent_amount) - Math.abs(a.recent_amount))
        .slice(0, 5)
        .map(series => `${series.merchant} $${Math.abs(series.recent_amount).toFixed(0)}/${series.cadence}`)
        .join(', ');
        
    return {
        monthlyIncome,
        monthlyExpenses,
        recurringExpenseSummary: topRecurring || "No major recurring expenses detected"
    };
}

function summarizeBaselineForecast(forecast: Forecast) {
    const transactions = forecast.predicted_transactions;
    const forecastDays = 90;
    
    const totalIncome = transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);
    const totalExpenses = transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        
    return {
        monthlyIncome: (totalIncome / forecastDays) * 30, // Convert to monthly rate
        monthlyExpenses: (totalExpenses / forecastDays) * 30
    };
}

function applyGeminiRefinements(
    baseForecast: Forecast, 
    geminiResponse: { expense_multipliers: number[]; income_targets: number[]; reasoning: string },
    baseline: { monthlyIncome: number; monthlyExpenses: number }
): Forecast {
    // Validate Gemini response
    const { expense_multipliers, income_targets } = geminiResponse;
    
    if (!Array.isArray(expense_multipliers) || expense_multipliers.length !== 3 ||
        !Array.isArray(income_targets) || income_targets.length !== 3) {
        console.warn("Invalid Gemini response format, using baseline forecast");
        return baseForecast;
    }
    
    // Clamp multipliers to reasonable ranges to prevent extreme adjustments
    const clampedExpenseMultipliers = expense_multipliers.map(m => 
        Math.max(0.4, Math.min(2.5, m || 1.0))
    );
    const clampedIncomeTargets = income_targets.map(t => 
        Math.max(0, Math.min(baseline.monthlyIncome * 3, t || baseline.monthlyIncome))
    );
    
    // Group transactions by month
    const txsByMonth = new Map<string, typeof baseForecast.predicted_transactions>();
    for (const tx of baseForecast.predicted_transactions) {
        const month = tx.date.substring(0, 7);
        if (!txsByMonth.has(month)) {
            txsByMonth.set(month, []);
        }
        txsByMonth.get(month)!.push(tx);
    }
    
    // Apply adjustments month by month
    const refinedTransactions = [];
    const months = [...txsByMonth.keys()].sort();
    
    for (let i = 0; i < months.length; i++) {
        const month = months[i];
        const monthTxs = txsByMonth.get(month) || [];
        const monthIndex = Math.min(i, 2); // Use last multiplier for any months beyond 3
        
        const expenseMultiplier = clampedExpenseMultipliers[monthIndex];
        const incomeTarget = clampedIncomeTargets[monthIndex];
        
        // Calculate current monthly totals
        const currentMonthlyIncome = monthTxs
            .filter(tx => tx.amount > 0)
            .reduce((sum, tx) => sum + tx.amount, 0);
        const currentMonthlyExpenses = monthTxs
            .filter(tx => tx.amount < 0)
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            
        // Apply refinements
        const incomeScale = currentMonthlyIncome > 0 ? incomeTarget / currentMonthlyIncome : 1;
        
        for (const tx of monthTxs) {
            if (tx.amount > 0) {
                // Scale income toward target
                refinedTransactions.push({
                    ...tx,
                    amount: Math.round(tx.amount * incomeScale * 100) / 100
                });
            } else {
                // Apply expense multiplier
                refinedTransactions.push({
                    ...tx,
                    amount: Math.round(tx.amount * expenseMultiplier * 100) / 100
                });
            }
        }
    }
    
    return {
        ...baseForecast,
        predicted_transactions: refinedTransactions
    };
}
