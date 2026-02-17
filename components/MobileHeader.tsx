"use client";

import { useState } from "react";
import { Menu, X, Wallet } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function MobileHeader() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Mobile header bar */}
            <header className="flex md:hidden items-center justify-between border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl px-4 py-3 sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-violet-600">
                        <Wallet className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-lg font-bold text-white">Arc</span>
                </div>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                    aria-label={isOpen ? "Close menu" : "Open menu"}
                >
                    {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
            </header>

            {/* Mobile sidebar overlay */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm md:hidden"
                        onClick={() => setIsOpen(false)}
                    />
                    {/* Sidebar drawer */}
                    <div className="fixed inset-y-0 left-0 z-[60] w-64 md:hidden animate-in slide-in-from-left duration-300">
                        <Sidebar onNavigate={() => setIsOpen(false)} />
                    </div>
                </>
            )}
        </>
    );
}
