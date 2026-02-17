"use client";

import { motion } from "framer-motion";
import { Hourglass } from "lucide-react";

interface LoadingScreenProps {
    stage: 'idle' | 'transactions' | 'forecast' | 'complete';
    onStartTutorial?: () => void;
}

export function LoadingScreen({ stage, onStartTutorial }: LoadingScreenProps) {
    const getMessage = () => {
        switch (stage) {
            case 'idle':
                return "Initializing secure connection...";
            case 'transactions':
                return "Syncing financial data...";
            case 'forecast':
                return "Running AI prediction models...";
            case 'complete':
                return "Welcome back.";
            default:
                return "Loading...";
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white">
            <div className="relative flex flex-col items-center">
                {/* Logo or Brand Placeholder */}
                <div className="mb-8 text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 animate-pulse">
                    FORECASTER
                </div>

                {/* Hourglass with Flip Animation */}
                <div className="relative mb-8">
                    <div className="absolute inset-0 rounded-full blur-xl bg-blue-500/20 animate-pulse"></div>
                    <motion.div
                        animate={{ rotate: 180 }}
                        transition={{
                            repeat: Infinity,
                            duration: 2,
                            ease: "easeInOut",
                            repeatDelay: 0.5
                        }}
                    >
                        <Hourglass className="h-12 w-12 text-blue-500 relative z-10" />
                    </motion.div>
                </div>

                {/* Status Text */}
                <div className="h-8 mb-6">
                    <p className="text-zinc-400 text-sm font-medium animate-pulse transition-all duration-300">
                        {getMessage()}
                    </p>
                </div>

                {/* Tutorial Trigger */}
                {onStartTutorial && (
                    <button
                        type="button"
                        onClick={onStartTutorial}
                        className="rounded-full border border-zinc-800 bg-zinc-900/50 px-6 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 transition-all cursor-pointer z-50 pointer-events-auto"
                    >
                        View Tutorial
                    </button>
                )}
            </div>

            <div className="absolute bottom-8 text-xs text-zinc-600">
                Encrypted End-to-End
            </div>
        </div>
    );
}
