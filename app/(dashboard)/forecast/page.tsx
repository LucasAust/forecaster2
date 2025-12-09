"use client";

import { useState } from "react";
import { ForecastGraph } from "@/components/ForecastGraph";
import { ForecastCalendar } from "@/components/ForecastCalendar";
import { AISuggestions } from "@/components/AISuggestions";
// removed Lightbulb import as it is inside AISuggestions now, or keep it if used elsewhere (it was only used in the removed block)

export default function ForecastPage() {
    const [forecastDays, setForecastDays] = useState(30);

    return (
        <div className="space-y-8">
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
                                    onClick={() => setForecastDays(30)}
                                    className={`rounded-lg px-3 py-1 text-sm transition-colors ${forecastDays === 30 ? 'bg-zinc-800 text-zinc-300' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    30 Days
                                </button>
                                <button
                                    onClick={() => setForecastDays(60)}
                                    className={`rounded-lg px-3 py-1 text-sm transition-colors ${forecastDays === 60 ? 'bg-zinc-800 text-zinc-300' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    60 Days
                                </button>
                                <button
                                    onClick={() => setForecastDays(90)}
                                    className={`rounded-lg px-3 py-1 text-sm transition-colors ${forecastDays === 90 ? 'bg-zinc-800 text-zinc-300' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    90 Days
                                </button>
                            </div>
                        </div>
                        <ForecastGraph days={forecastDays} />
                    </div>

                    <div className="glass-card rounded-2xl p-6">
                        <h2 className="mb-4 text-lg font-semibold text-white">Daily Breakdown</h2>
                        <ForecastCalendar />
                    </div>
                </div>

                {/* Sidebar / Suggestions */}
                <div className="lg:col-span-1 space-y-6">
                    <AISuggestions />


                </div>
            </div>
        </div>
    );
}
