"use client";

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/api";
import { ChevronRight, ChevronLeft, X, Target, BarChart3, TrendingUp, MessageSquare, Sparkles, Wallet } from "lucide-react";
import { clsx } from "clsx";

interface OnboardingStep {
    title: string;
    description: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    selector?: string; // CSS selector to highlight
    budgetStep?: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        title: "Welcome to Arc!",
        description: "Let's take a quick tour of your financial dashboard. We'll show you what each section does and help you get set up.",
        icon: Wallet,
        color: "text-blue-500",
        bg: "bg-blue-500/20",
    },
    {
        title: "Balance & Quick Glance",
        description: "At the top of your dashboard, you'll see your current balance and recent transactions at a glance. This updates automatically when you sync.",
        icon: BarChart3,
        color: "text-emerald-500",
        bg: "bg-emerald-500/20",
        selector: "[data-onboarding='quick-glance']",
    },
    {
        title: "Balance Chart",
        description: "This chart shows your balance over time — both historical and predicted. The blue area shows where our AI thinks your balance is heading.",
        icon: TrendingUp,
        color: "text-violet-500",
        bg: "bg-violet-500/20",
        selector: "[data-onboarding='balance-chart']",
    },
    {
        title: "AI Suggestions",
        description: "Our AI analyzes your spending patterns and provides actionable suggestions to help you save money and stay on track.",
        icon: Sparkles,
        color: "text-amber-500",
        bg: "bg-amber-500/20",
        selector: "[data-onboarding='ai-suggestions']",
    },
    {
        title: "Chat with Arc",
        description: "Have questions about your finances? Ask our AI assistant anything — from spending breakdowns to saving tips.",
        icon: MessageSquare,
        color: "text-pink-500",
        bg: "bg-pink-500/20",
        selector: "[data-onboarding='chat']",
    },
    {
        title: "Set Your Budget",
        description: "Setting a monthly budget is key to reaching your goals. Enter your target below — you can always change it later in Settings.",
        icon: Target,
        color: "text-cyan-500",
        bg: "bg-cyan-500/20",
        budgetStep: true,
    },
];

export function OnboardingWalkthrough({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState(0);
    const [budget, setBudget] = useState("");
    const [saving, setSaving] = useState(false);
    const current = ONBOARDING_STEPS[step];

    // Scroll highlighted element into view
    useEffect(() => {
        if (current.selector) {
            const el = document.querySelector(current.selector);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }, [step, current.selector]);

    const handleNext = async () => {
        // If on budget step & has budget, save it
        if (current.budgetStep && budget) {
            setSaving(true);
            try {
                await authFetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ monthly_budget: parseFloat(budget) }),
                });
            } catch {
                // Non-blocking
            }
            setSaving(false);
        }

        if (step < ONBOARDING_STEPS.length - 1) {
            setStep(s => s + 1);
        } else {
            // Mark onboarding complete
            localStorage.setItem("arc-onboarding-complete", "true");
            onComplete();
        }
    };

    const handlePrev = () => {
        if (step > 0) setStep(s => s - 1);
    };

    const handleSkip = () => {
        localStorage.setItem("arc-onboarding-complete", "true");
        onComplete();
    };

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm" />

            {/* Spotlight ring on target element */}
            <HighlightOverlay selector={current.selector} />

            {/* Modal card */}
            <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-4">
                <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
                    {/* Close / Skip */}
                    <button
                        type="button"
                        onClick={handleSkip}
                        className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
                        title="Skip onboarding"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Progress dots */}
                    <div className="flex justify-center gap-1.5 mb-6 mt-1">
                        {ONBOARDING_STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={clsx(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    i === step ? "w-6 bg-white" : i < step ? "w-1.5 bg-blue-500" : "w-1.5 bg-zinc-800"
                                )}
                            />
                        ))}
                    </div>

                    {/* Icon + Content */}
                    <div className="flex flex-col items-center text-center">
                        <div className={clsx("mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-xl", current.bg)}>
                            <current.icon className={clsx("h-8 w-8", current.color)} />
                        </div>
                        <h2 className="mb-2 text-xl font-bold text-white">{current.title}</h2>
                        <p className="mb-6 text-sm text-zinc-400 leading-relaxed">{current.description}</p>

                        {/* Budget input on budget step */}
                        {current.budgetStep && (
                            <div className="w-full mb-4">
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-lg">$</span>
                                    <input
                                        type="number"
                                        value={budget}
                                        onChange={(e) => setBudget(e.target.value)}
                                        placeholder="e.g. 3000"
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-900/50 py-3 pl-8 pr-4 text-center text-lg text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <p className="text-xs text-zinc-600 mt-2">Monthly spending limit</p>
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-between mt-2">
                        <button
                            type="button"
                            onClick={handlePrev}
                            disabled={step === 0}
                            className={clsx(
                                "flex items-center gap-1 text-sm font-medium transition-colors",
                                step === 0 ? "text-zinc-700 cursor-not-allowed" : "text-zinc-400 hover:text-white"
                            )}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Back
                        </button>

                        <div className="flex items-center gap-3">
                            {step < ONBOARDING_STEPS.length - 1 && (
                                <button
                                    type="button"
                                    onClick={handleSkip}
                                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                    Skip tour
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={saving}
                                className="flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-sm font-bold text-black hover:bg-zinc-200 transition-transform active:scale-95 disabled:opacity-50"
                            >
                                {step === ONBOARDING_STEPS.length - 1
                                    ? (saving ? "Saving…" : "Finish")
                                    : "Next"}
                                {step < ONBOARDING_STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Step count */}
                    <p className="text-center text-xs text-zinc-700 mt-4">
                        {step + 1} of {ONBOARDING_STEPS.length}
                    </p>
                </div>
            </div>
        </>
    );
}

function HighlightOverlay({ selector }: { selector?: string }) {
    const [rect, setRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!selector) {
            setRect(null);
            return;
        }
        const el = document.querySelector(selector);
        if (el) {
            setRect(el.getBoundingClientRect());
        } else {
            setRect(null);
        }
    }, [selector]);

    if (!rect) return null;

    const padding = 8;
    return (
        <div
            className="fixed z-[205] rounded-xl border-2 border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.3)] pointer-events-none transition-all duration-500"
            style={{
                top: rect.top - padding,
                left: rect.left - padding,
                width: rect.width + padding * 2,
                height: rect.height + padding * 2,
            }}
        />
    );
}
