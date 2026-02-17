"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const options = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
];

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <Sun className="h-5 w-5 text-amber-500" />
                    <h3 className="text-lg font-medium text-white">Appearance</h3>
                </div>
                <p className="text-sm text-zinc-400">
                    Choose your preferred theme or follow your system settings.
                </p>
            </div>

            <div className="mt-6 flex gap-3">
                {options.map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        className={`flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
                            theme === value
                                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                                : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                        }`}
                    >
                        <Icon size={20} />
                        <span className="text-sm font-medium">{label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
