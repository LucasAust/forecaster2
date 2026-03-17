"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight, X, CheckCircle2 } from "lucide-react";
import type { InsightQuestion, InsightAnswer } from "@/lib/insight-questions";

interface Props {
    onComplete?: () => void; // Called after all questions answered — trigger re-forecast
}

export function InsightQuestionsModal({ onComplete }: Props) {
    const [questions, setQuestions] = useState<InsightQuestion[]>([]);
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<InsightAnswer[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Fetch questions on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/insights/questions");
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.questions) && data.questions.length > 0) {
                    setQuestions(data.questions);
                }
            } catch {
                // Non-fatal
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const submitAll = useCallback(async (allAnswers: InsightAnswer[]) => {
        setSubmitting(true);
        try {
            await fetch("/api/insights/answers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers: allAnswers }),
            });
        } catch {
            // Non-fatal
        }
        setSubmitting(false);
        setDone(true);
        // Give user a moment to see the success state, then close and trigger re-forecast
        setTimeout(() => {
            setQuestions([]);
            onComplete?.();
        }, 1500);
    }, [onComplete]);

    if (!loaded || questions.length === 0 || dismissed) return null;

    const total = questions.length;
    const currentQ = questions[step];

    const handleAnswer = (value: string) => {
        const newAnswer: InsightAnswer = {
            question_id: currentQ.id,
            value,
            answered_at: new Date().toISOString(),
        };
        const newAnswers = [...answers, newAnswer];
        setAnswers(newAnswers);

        if (step < total - 1) {
            setStep(s => s + 1);
        } else {
            submitAll(newAnswers);
        }
    };

    const handleSkip = () => {
        if (step < total - 1) {
            setStep(s => s + 1);
        } else {
            submitAll(answers);
        }
    };

    const handleDismiss = () => {
        // Save whatever answers we have so far
        if (answers.length > 0) {
            fetch("/api/insights/answers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers }),
            }).catch(() => {});
        }
        setDismissed(true);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <AnimatePresence mode="wait">
                {done ? (
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
                        <p className="text-white font-medium">Got it! Improving your forecast…</p>
                        <p className="text-zinc-500 text-sm text-center">
                            Your answers will make predictions significantly more accurate.
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
                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                    <Sparkles className="h-4 w-4 text-violet-400" />
                                </div>
                                <div>
                                    <p className="text-white text-sm font-semibold">Help us predict better</p>
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
                                className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full"
                                initial={{ width: `${(step / total) * 100}%` }}
                                animate={{ width: `${((step + 1) / total) * 100}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>

                        {/* Context (if available) */}
                        {currentQ.context && (
                            <div className="mx-5 mt-4 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                                <p className="text-zinc-400 text-xs">{currentQ.context}</p>
                            </div>
                        )}

                        {/* Question */}
                        <p className="mx-5 mt-4 text-white text-sm font-medium">
                            {currentQ.question}
                        </p>

                        {/* Answer options */}
                        <div className="mx-5 mt-3 flex flex-col gap-2">
                            {currentQ.options.map((option, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleAnswer(option.value)}
                                    className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-left text-sm text-zinc-200 hover:text-white transition-all group"
                                >
                                    <span>{option.label}</span>
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
                                Skip
                            </button>
                            <p className="text-xs text-zinc-600">
                                3-5 quick questions • dramatically improves accuracy
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
