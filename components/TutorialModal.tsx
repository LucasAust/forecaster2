import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Wallet, LineChart, PieChart, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";

interface TutorialModalProps {
    onClose: () => void;
}

const steps = [
    {
        title: "Welcome to Arc",
        description: "Your financial crystal ball. We combine your actual history with AI predictions to show you the future of your money.",
        icon: Wallet,
        color: "text-blue-500",
        bg: "bg-blue-500/20"
    },
    {
        title: "Secure Connection",
        description: "Start by connecting your bank accounts securely. We use encryption to analyze your spending patterns without storing credentials.",
        icon: ShieldCheck,
        color: "text-emerald-500",
        bg: "bg-emerald-500/20"
    },
    {
        title: "AI Forecasts",
        description: "Our AI 'Oracle' predicts your upcoming bills and income. It finds patterns you might miss, giving you a heads-up on your balance.",
        icon: LineChart,
        color: "text-violet-500",
        bg: "bg-violet-500/20"
    },
    {
        title: "Smart Budgeting",
        description: "Set monthly limits and track variance. We'll show you if you're on track to save or overspend before it happens.",
        icon: PieChart,
        color: "text-amber-500",
        bg: "bg-amber-500/20"
    }
];

export function TutorialModal({ onClose }: TutorialModalProps) {
    const [currentStep, setCurrentStep] = useState(0);

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(c => c + 1);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(c => c - 1);
        }
    };

    const step = steps[currentStep];

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>

                {/* Progress Indicators */}
                <div className="flex justify-center gap-2 mb-8 mt-2">
                    {steps.map((_, i) => (
                        <div
                            key={i}
                            className={clsx(
                                "h-1.5 rounded-full transition-all duration-300",
                                i === currentStep ? "w-8 bg-white" : "w-1.5 bg-zinc-800"
                            )}
                        />
                    ))}
                </div>

                {/* Content */}
                <div className="flex flex-col items-center text-center">
                    <div className={clsx("mb-6 flex h-20 w-20 items-center justify-center rounded-2xl shadow-xl transition-all duration-500", step.bg)}>
                        <step.icon className={clsx("h-10 w-10 transition-colors duration-500", step.color)} />
                    </div>

                    <h2 className="mb-2 text-2xl font-bold text-white transition-all">{step.title}</h2>
                    <p className="mb-8 text-zinc-400 transition-all">{step.description}</p>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between mt-4">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className={clsx(
                            "flex items-center gap-1 text-sm font-medium transition-colors",
                            currentStep === 0 ? "text-zinc-700 cursor-not-allowed" : "text-zinc-400 hover:text-white"
                        )}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        className="flex items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-black hover:bg-zinc-200 transition-transform active:scale-95"
                    >
                        {currentStep === steps.length - 1 ? "Get Started" : "Next"}
                        {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
