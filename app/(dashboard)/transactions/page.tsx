"use client";

import { TransactionsTable } from "@/components/TransactionsTable";
import { Search, Filter, Download } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

export default function TransactionsPage() {
    const [filter, setFilter] = useState<'all' | 'actual' | 'predicted'>('all');
    const [searchQuery, setSearchQuery] = useState("");

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Transactions</h1>
                    <p className="text-zinc-400">View actual and predicted transaction history.</p>
                </div>
                <div className="flex space-x-3">
                    <button className="flex items-center space-x-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors">
                        <Download size={16} />
                        <span>Export</span>
                    </button>
                </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
                {/* Controls */}
                <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search merchants..."
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900/50 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2 rounded-lg bg-zinc-900/50 p-1 border border-zinc-800">
                            <button
                                onClick={() => setFilter('all')}
                                className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === 'all' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-white")}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilter('actual')}
                                className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === 'actual' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-white")}
                            >
                                Actual
                            </button>
                            <button
                                onClick={() => setFilter('predicted')}
                                className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === 'predicted' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-white")}
                            >
                                Predicted
                            </button>
                        </div>
                        <button className="flex items-center space-x-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400 hover:text-white">
                            <Filter size={16} />
                            <span>Filter</span>
                        </button>
                    </div>
                </div>

                <TransactionsTable filter={filter} searchQuery={searchQuery} />

                <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
                    <p className="text-xs text-zinc-500">Showing transactions based on filters</p>
                    {/* Pagination could go here later */}
                </div>
            </div>
        </div>
    );
}
