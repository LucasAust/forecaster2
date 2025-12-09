"use client";

import { Send, Sparkles, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useSync } from "@/contexts/SyncContext";

export interface ChatInterfaceRef {
    sendMessage: (message: string) => void;
}

const initialMessages = [
    { role: "assistant", content: "Hello! I'm your financial scenario assistant. Ask me anything like 'What if I buy a car?' or 'Can I afford a vacation?'" },
];

export const ChatInterface = forwardRef<ChatInterfaceRef, {}>((props, ref) => {
    const { transactions, forecast } = useSync();
    const [messages, setMessages] = useState(initialMessages);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [budget, setBudget] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Fetch budget on mount
    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data.monthly_budget) setBudget(data.monthly_budget);
            })
            .catch(err => console.error("Failed to fetch budget for chat context", err));
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }); // Close useEffect

    const handleSend = async (messageOverride?: string) => {
        const messageToSend = messageOverride || input;
        if (!messageToSend.trim() || isLoading) return;

        const userMsg = { role: "user", content: messageToSend };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            // Prepare context
            // Calculate current balance (sum of all transactions? roughly? or just pass recent history)
            // Just passing history allows Gemini to infer balance trend if not absolute balance.

            const context = {
                monthly_budget: budget,
                history: transactions?.slice(0, 50), // Last 50 txs
                forecast: forecast?.predicted_transactions?.slice(0, 30), // Next 30 days
                balance: "Calculated from recent history"
            };

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    context
                })
            });

            const data = await response.json();

            if (data.message) {
                setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
            } else {
                setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't generate a response." }]);
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting right now." }]);
        } finally {
            setIsLoading(false);
        }
    };

    useImperativeHandle(ref, () => ({
        sendMessage: (message: string) => {
            handleSend(message);
        }
    }));

    return (
        <div className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center border-b border-zinc-800 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-500">
                    <Sparkles size={16} />
                </div>
                <span className="ml-3 font-medium text-white">Scenario Assistant</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user"
                                ? "bg-blue-600 text-white rounded-br-none"
                                : "bg-zinc-800 text-zinc-200 rounded-bl-none"
                                }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-zinc-800 text-zinc-200 rounded-2xl rounded-bl-none px-4 py-3 text-sm flex items-center">
                            <Loader2 size={16} className="animate-spin mr-2" />
                            <span>Thinking...</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t border-zinc-800 p-4">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a scenario..."
                        disabled={isLoading}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-4 pr-12 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
});
ChatInterface.displayName = "ChatInterface";
