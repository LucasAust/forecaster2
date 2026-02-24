"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, ChevronRight, X, CheckCircle2 } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import type { ClarificationAnswer } from "@/types";

export function TransactionClarificationModal() {
    const { pendingClarifications, submitClarifications, dismissClarifications } = useSync();
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<ClarificationAnswer[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    // Reset local state if a new batch of clarifications arrives
    const total = pendingClarifications.length;
    if (total === 0 && !submitting && !done) return null;

    const currentQ = pendingClarifications[step];

    const handleAnswer = async (category: string) => {
        if (!currentQ) return;

        const newAnswers = [...answers, { transaction_id: currentQ.transaction_id, category }];
        setAnswers(newAnswers);

        if (step < total - 1) {
            setStep((s: number) => s + 1);
        } else {
            // Last question — submit all answers
            setSubmitting(true);
            setDone(true);
            await submitClarifications(newAnswers);
            setSubmitting(false);
            setAnswers([]);
            setStep(0);
        }
    };

    const handleSkip = () => {
        if (step < total - 1) {
            setStep((s: number) => s + 1);
        } else {
            // Submit whatever answers we have so far (skipped ones don't get overridden)
            setDone(true);
            submitClarifications(answers).then(() => {
                setAnswers([]);
                setStep(0);
                setDone(false);
            });
        }
    };

    const handleDismiss = () => {
        dismissClarifications();
        setAnswers([]);
        setStep(0);
        setDone(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <AnimatePresence mode="wait">
                {done && submitting ? (
                    <motion.div
                        key="done"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full"
                    >
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                        </div>
                        <p className="text-white font-medium">Updating your forecast…</p>
                        <p className="text-zinc-500 text-sm text-center">
                            Your answers are being applied. The forecast will refresh in a moment.
                        </p>
                    </motion.div>
                ) : (
                    <motion.div
                        key={`question-${step}`}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                    <HelpCircle className="h-4 w-4 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-white text-sm font-semibold">Help us categorize</p>
                                    <p className="text-zinc-500 text-xs">
                                        Question {step + 1} of {total}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleDismiss}
                                className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Progress bar */}
                        <div className="mx-5 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                                initial={{ width: `${(step / total) * 100}%` }}
                                animate={{ width: `${((step + 1) / total) * 100}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>

                        {/* Transaction context */}
                        <div className="mx-5 mt-4 p-3.5 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                            <div className="flex items-center justify-between">
                                <p className="text-white text-sm font-medium truncate pr-4">
                                    {currentQ?.transaction_name}
                                </p>
                                <p className={`text-sm font-semibold shrink-0 ${currentQ?.amount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {currentQ?.amount > 0
                                        ? `-$${Math.abs(currentQ.amount).toFixed(2)}`
                                        : `+$${Math.abs(currentQ?.amount ?? 0).toFixed(2)}`
                                    }
                                </p>
                            </div>
                            <p className="text-zinc-500 text-xs mt-1">
                                {currentQ?.date
                                    ? new Date(currentQ.date + 'T12:00:00').toLocaleDateString('en-US', {
                                        month: 'short', day: 'numeric', year: 'numeric'
                                    })
                                    : ''}
                            </p>
                        </div>

                        {/* Question */}
                        <p className="mx-5 mt-4 text-white text-sm font-medium">
                            {currentQ?.question}
                        </p>

                        {/* Answer options */}
                        <div className="mx-5 mt-3 flex flex-col gap-2">
                            {currentQ?.options.map((option, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleAnswer(currentQ.category_mappings[i])}
                                    className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-left text-sm text-zinc-200 hover:text-white transition-all group"
                                >
                                    <span>{option}</span>
                                    <ChevronRight className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors" />
                                </button>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-5 py-4 mt-2">
                            <button
                                onClick={handleSkip}
                                className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
                            >
                                Skip this question
                            </button>
                            <p className="text-xs text-zinc-600">
                                Improves prediction accuracy
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
