"use client";

import { ChatInterface, ChatInterfaceRef } from "@/components/ChatInterface";
import { ScenarioOutput } from "@/components/ScenarioOutput";
import { Car, Plane, Briefcase } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

function ScenariosContent() {
    const chatRef = useRef<ChatInterfaceRef>(null);
    const searchParams = useSearchParams();
    const prompt = searchParams.get('prompt');
    const processedPrompt = useRef<string | null>(null);

    useEffect(() => {
        if (prompt && chatRef.current && processedPrompt.current !== prompt) {
            processedPrompt.current = prompt;
            // Tiny timeout to ensure chat is ready/mounted
            setTimeout(() => {
                chatRef.current?.sendMessage(prompt);
            }, 100);
        }
    }, [prompt]);

    const handlePrompt = (p: string) => {
        if (chatRef.current) {
            chatRef.current.sendMessage(p);
        }
    };

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Scenario Planner</h1>
                <p className="text-zinc-400">Ask "What if?" and see the future.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 flex-1 min-h-0">
                {/* Left Column: Chat */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    <div className="flex space-x-3 overflow-x-auto pb-1 scrollbar-hide shrink-0">
                        <button
                            onClick={() => handlePrompt("What if I have an unexpected $500 car repair expense today?")}
                            className="flex items-center space-x-2 whitespace-nowrap rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                        >
                            <Car size={16} className="text-blue-400" />
                            <span>Car Repair ($500)</span>
                        </button>
                        <button
                            onClick={() => handlePrompt("Can I afford a $2000 vacation next month?")}
                            className="flex items-center space-x-2 whitespace-nowrap rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                        >
                            <Plane size={16} className="text-violet-400" />
                            <span>Vacation ($2000)</span>
                        </button>
                        <button
                            onClick={() => handlePrompt("What happens if I lose my main income source starting next month?")}
                            className="flex items-center space-x-2 whitespace-nowrap rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                        >
                            <Briefcase size={16} className="text-rose-400" />
                            <span>Job Loss</span>
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <ChatInterface ref={chatRef} />
                    </div>
                </div>

                {/* Right Column: Output */}
                <div className="h-full overflow-y-auto">
                    <ScenarioOutput />
                </div>
            </div>
        </div>
    );
}

export default function ScenariosPage() {
    return (
        <Suspense fallback={<div className="text-zinc-500">Loading...</div>}>
            <ScenariosContent />
        </Suspense>
    );
}
