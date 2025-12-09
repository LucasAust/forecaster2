import { GoogleGenerativeAI } from "@google/generative-ai";

export const geminiClient = {
    generateForecast: async (history: any[]) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("GEMINI_API_KEY is missing");
            throw new Error("GEMINI_API_KEY is not set");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Normalize history: Plaid uses Positive=Expense, Negative=Income.
        // We want Negative=Expense, Positive=Income for the AI to understand better.
        const normalizedHistory = history.map((tx: any) => ({
            ...tx,
            amount: tx.amount * -1
        }));

        const prompt = `
        You are a financial prediction engine. I will provide you with a JSON of the user's transaction history.
        Task: Generate a transaction ledger for the NEXT 90 days based **ONLY** on identifiable recurring patterns in the history.

        **STRICT RULES - READ CAREFULLY:**
        1. **NO HALLUCINATIONS**: Do NOT invent new merchants, categories, or amounts. Use ONLY what is in the history.
        2. **STRICT RECURRENCE**: Only predict a transaction if it happens on a repeating schedule (e.g., Weekly, Bi-weekly, Monthly). If it happens once a month, predict it EXACTLY once a month.
        3. **ANCHOR DATES**: Identify the "Anchor Date" for monthly items (e.g., the 14th). Future predictions MUST align with this date (+/- 2 days for weekends). Do not let dates drift (e.g. 14th -> 24th is WRONG).
        4. **MERCHANT DISTINCTNESS**: Treat merchants with different identifiers (e.g. "Uber 063015" vs "Uber 072515") as COMPLETELY SEPARATE series. Do not mix them.
        5. **CONSISTENT HABITS**: If a merchant (even "random" ones like Starbucks, McDonald's) appears on a consistent monthly schedule (e.g. 12th of each month), PREDICT IT. Do not ignore it.
        6. **SPORADIC DISCRETIONARY**: For categories that occur frequently but on random dates (e.g. Dining, Groceries, Transport), determine the **Average Weekly Frequency** and **Average Amount**. Predict them distributed roughly evenly.
        7. **VARIABLE AMOUNTS**: For sporadic/variable items, use the **Average** amount of the recent history. For fixed bills, use the **Exact** amount.
        8. **PRESERVE BATCHES**: If a specific merchant and amount appears multiple times on the same day in the history (e.g., 10 separate payments to United Airlines), you must predict 10 separate payments for the future date. Do not flatten or group them.
        9. **END OF MONTH**: Pay special attention to transactions that occur on the 28th-31st. These are likely monthly bills. Ensure they are included.
        10. **CONSISTENCY**: If a merchant is usually an expense (negative), ignore rare refunds (positive) when forecasting. Predict the dominant pattern (the expense).

        Input History:
        ${JSON.stringify(normalizedHistory.slice(0, 300))}
        
        Output:
        Return ONLY a JSON object containing an array of these predicted transactions. Do not include markdown or conversational text.
        Format:
        {
            "forecast_period_days": 90,
            "predicted_transactions": [
                {
                    "date": "YYYY-MM-DD",
                    "day_of_week": "DayName",
                    "merchant": "Merchant Name",
                    "amount": number (negative for expense, positive for income),
                    "category": "Category Name",
                    "type": "expense" | "income",
                    "confidence_score": "high" | "medium" | "low"
                }
            ]
        }
        `;

        let retries = 3;
        while (retries > 0) {
            try {
                console.log(`Sending prompt to Gemini (Attempt ${4 - retries}/3):`, prompt);
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                console.log("Received response from Gemini:", text);

                // Clean up markdown code blocks if present
                const cleanText = text.replace(/```json/g, '').replace(/```/g, '');
                return JSON.parse(cleanText);
            } catch (error: any) {
                console.error(`Gemini API Error (Attempt ${4 - retries}/3):`, error);
                if (error.status === 503 || error.message?.includes('overloaded')) {
                    retries--;
                    if (retries === 0) throw error;
                    // Wait 1s, 2s, 4s...
                    await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
                } else {
                    throw error;
                }
            }
        }
    },
    generateSuggestions: async (history: any[], forecast: any) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
            const text = response.text().replace(/```json/g, '').replace(/```/g, '');
            return JSON.parse(text);
        } catch (error) {
            console.error("Gemini Suggestions Error:", error);
            return { suggestions: [] };
        }
    },
    async generateChatResponse(messages: any[], context: any) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Construct a system instruction with context
        const systemPrompt = `
        You are a financial scenario assistant. You help the user understand the impact of potential financial decisions.
        
        User Context:
        - Current Balance (approx): $${context.balance || 'Unknown'}
        - Monthly Budget Target: $${context.monthly_budget || 'Not set'}
        - Recent Transactions: ${JSON.stringify((context.history || []).slice(0, 20))}
        - Forecasted Transactions (Next 30 days): ${JSON.stringify((context.forecast || []).slice(0, 20))}

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
