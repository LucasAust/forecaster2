"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ForecastGraph } from "@/components/ForecastGraph";
import { AISuggestions } from "@/components/AISuggestions";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/MotionWrappers";

import { ForecastAccuracy } from "@/components/ForecastAccuracy";
import { RecurringTransactions } from "@/components/RecurringTransactions";

// Lazy-load below-fold heavy components
const ForecastCalendar = dynamic(() => import("@/components/ForecastCalendar").then(m => ({ default: m.ForecastCalendar })), { loading: () => <div className="h-48 animate-pulse rounded-xl bg-zinc-800/50" /> });
const BillCalendar = dynamic(() => import("@/components/BillCalendar").then(m => ({ default: m.BillCalendar })), { loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-800/50" /> });

export default function ForecastPage() {
    const [forecastDays, setForecastDays] = useState(30);

    return (
        <PageTransition className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Forecast Hub</h1>
                <p className="text-zinc-400">Detailed breakdown of your future cash flow.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Main Chart */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card rounded-2xl p-6">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">Projected Cash Flow</h2>
                            <div className="flex space-x-2">
                                <button
                                    type="button"
                                    onClick={() => setForecastDays(30)}
                                    className={`rounded-lg px-3 py-1 text-sm transition-colors ${forecastDays === 30 ? 'bg-zinc-800 text-zinc-300' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    30 Days
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForecastDays(60)}
                                    className={`rounded-lg px-3 py-1 text-sm transition-colors ${forecastDays === 60 ? 'bg-zinc-800 text-zinc-300' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    60 Days
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForecastDays(90)}
                                    className={`rounded-lg px-3 py-1 text-sm transition-colors ${forecastDays === 90 ? 'bg-zinc-800 text-zinc-300' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    90 Days
                                </button>
                            </div>
                        </div>
                        <ErrorBoundary fallbackTitle="Forecast chart failed to load">
                            <ForecastGraph days={forecastDays} />
                        </ErrorBoundary>
                    </div>

                    <div className="glass-card rounded-2xl p-6">
                        <h2 className="mb-4 text-lg font-semibold text-white">Daily Breakdown</h2>
                        <ErrorBoundary fallbackTitle="Calendar failed to load">
                            <ForecastCalendar />
                        </ErrorBoundary>
                    </div>

                    <ErrorBoundary fallbackTitle="Bill calendar failed to load">
                        <BillCalendar />
                    </ErrorBoundary>
                </div>

                {/* Sidebar / Suggestions */}
                <div className="lg:col-span-1 space-y-6">
                    <ErrorBoundary fallbackTitle="Forecast accuracy failed to load">
                        <ForecastAccuracy />
                    </ErrorBoundary>
                    <div className="glass-card rounded-2xl p-6">
                        <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
                            Recurring Transactions
                        </h2>
                        <ErrorBoundary fallbackTitle="Recurring transactions failed to load">
                            <RecurringTransactions />
                        </ErrorBoundary>
                    </div>
                    <ErrorBoundary fallbackTitle="AI Suggestions failed to load">
                        <AISuggestions />
                    </ErrorBoundary>
                </div>
            </div>
        </PageTransition>
    );
}
