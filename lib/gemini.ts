import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Transaction, Forecast, AISuggestion, ChatMessage } from "@/types";
import {
    generateDeterministicForecast,
    validateForecast,
} from "./forecast-engine";

/** Singleton — reuse across requests in the same process */
let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    if (!_genAI) _genAI = new GoogleGenerativeAI(apiKey);
    return _genAI;
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
    generateForecast: async (history: Transaction[]): Promise<Forecast> => {
        // Generate the full forecast deterministically — no LLM needed
        const forecast = generateDeterministicForecast(history);
        return validateForecast(forecast);
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
