"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight, X, CheckCircle2 } from "lucide-react";
import type { InsightQuestion, InsightAnswer } from "@/lib/insight-questions";

interface Props {
    onComplete?: () => void; // Called after all questions answered — trigger re-forecast
    showBeforeBank?: boolean; // Show onboarding questions before bank connection
    required?: boolean; // If true, user must complete questions (no dismiss/skip)
}

export function InsightQuestionsModal({ onComplete, showBeforeBank, required = false }: Props) {
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
                // Check if user has already completed onboarding questions
                const completedKey = "arc-insight-onboarding-done";
                if (!showBeforeBank || required) {
                    const done = localStorage.getItem(completedKey);
                    if (done) { if (!cancelled) setLoaded(true); return; }
                }

                const res = await fetch("/api/insights/questions");
                if (!res.ok) { if (!cancelled) setLoaded(true); return; }
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
    }, [showBeforeBank]);

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
        // Mark onboarding as complete so we don't show again until bank is connected
        try {
            localStorage.setItem("arc-insight-onboarding-done", "1");
            window.dispatchEvent(new Event("arc-insight-onboarding-updated"));
        } catch {}
        // Give user a moment to see the success state, then close and trigger re-forecast
        setTimeout(() => {
            setQuestions([]);
            onComplete?.();
        }, 1500);
    }, [onComplete]);

    if (!loaded || questions.length === 0 || dismissed) return null;

    const total = questions.length;
    const currentQ = questions[step];

    // Safety: if current question is somehow invalid, skip it
    if (!currentQ || !currentQ.question || !currentQ.options?.length) {
        if (step < total - 1) {
            setStep(s => s + 1);
            return null;
        }
        return null;
    }

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
        if (required) return;
        if (step < total - 1) {
            setStep(s => s + 1);
        } else {
            submitAll(answers);
        }
    };

    const handleDismiss = () => {
        if (required) return;
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
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
                        initial={{ opacity: 0, y: 20, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -12, scale: 0.97 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] overflow-y-auto"
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
                                disabled={required}
                                className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
                                aria-label={required ? "Questions are required" : "Close questions modal"}
                                title={required ? "Questions are required" : "Close"}
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
                                {currentQ.context.split("\n").map((line, i) => (
                                    <p key={i} className="text-zinc-400 text-xs">
                                        {line}
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Question */}
                        <p className="mx-5 mt-4 text-white text-sm font-medium">
                            {currentQ.question}
                        </p>

                        {/* Answer options */}
                        <div className={`mx-5 mt-3 ${currentQ.options.length > 6 ? "grid grid-cols-3 gap-2" : "flex flex-col gap-2"}`}>
                            {currentQ.options.map((option, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleAnswer(option.value)}
                                    className={`${
                                        currentQ.options.length > 6
                                            ? "flex items-center justify-center px-2 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-center text-xs text-zinc-200 hover:text-white transition-all"
                                            : "flex items-center justify-between w-full px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-left text-sm text-zinc-200 hover:text-white transition-all group"
                                    }`}
                                >
                                    <span>{option.label}</span>
                                    {currentQ.options.length <= 6 && (
                                        <ChevronRight className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-5 py-4 mt-2">
                            <button
                                onClick={handleSkip}
                                disabled={required}
                                className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
                            >
                                {required ? "Required" : "Skip"}
                            </button>
                            <p className="text-xs text-zinc-600">
                                {required
                                    ? "Complete all questions to unlock bank connection"
                                    : "A few quick questions • dramatically improves accuracy"}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
