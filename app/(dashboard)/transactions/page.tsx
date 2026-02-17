"use client";

import { TransactionsTable, TransactionsTableHandle } from "@/components/TransactionsTable";
import { Search, Filter, Download, X, FileSpreadsheet, FileText } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { CATEGORIES } from "@/lib/categories";
import { PageTransition } from "@/components/MotionWrappers";

export type ExportFormat = "csv" | "json";

export default function TransactionsPage() {
    const [filter, setFilter] = useState<'all' | 'actual' | 'predicted'>('all');
    const [searchQuery, setSearchQuery] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [amountMin, setAmountMin] = useState("");
    const [amountMax, setAmountMax] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [showExportMenu, setShowExportMenu] = useState(false);
    const tableRef = useRef<TransactionsTableHandle>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    // Close export menu on outside click
    useEffect(() => {
        if (!showExportMenu) return;
        const handler = (e: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showExportMenu]);

    const hasActiveFilters = dateFrom || dateTo || amountMin || amountMax || categoryFilter;

    const clearFilters = () => {
        setDateFrom("");
        setDateTo("");
        setAmountMin("");
        setAmountMax("");
        setCategoryFilter("");
    };

    return (
        <PageTransition className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Transactions</h1>
                    <p className="text-zinc-400">View actual and predicted transaction history.</p>
                </div>
                <div className="flex space-x-3 relative" ref={exportMenuRef}>
                    <button
                        type="button"
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="flex items-center space-x-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                        <Download size={16} />
                        <span>Export</span>
                    </button>
                    {showExportMenu && (
                        <div className="absolute right-0 top-full mt-2 z-50 w-40 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => {
                                    tableRef.current?.exportData("csv");
                                    setShowExportMenu(false);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                            >
                                <FileSpreadsheet size={14} />
                                Export CSV
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    tableRef.current?.exportData("json");
                                    setShowExportMenu(false);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                            >
                                <FileText size={14} />
                                Export JSON
                            </button>
                        </div>
                    )}
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
                                type="button"
                                onClick={() => setFilter('all')}
                                className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === 'all' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-white")}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilter('actual')}
                                className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === 'actual' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-white")}
                            >
                                Actual
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilter('predicted')}
                                className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === 'predicted' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-white")}
                            >
                                Predicted
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowFilters(!showFilters)}
                            className={clsx(
                                "flex items-center space-x-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                                showFilters || hasActiveFilters
                                    ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                                    : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:text-white"
                            )}
                        >
                            <Filter size={16} />
                            <span>Filter</span>
                            {hasActiveFilters && (
                                <span className="ml-1 h-2 w-2 rounded-full bg-blue-500" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Advanced Filter Panel */}
                {showFilters && (
                    <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-zinc-300">Advanced Filters</h3>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    <X size={12} /> Clear all
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Date range */}
                            <div>
                                <label htmlFor="filter-date-from" className="text-xs text-zinc-500 mb-1 block">From Date</label>
                                <input
                                    id="filter-date-from"
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label htmlFor="filter-date-to" className="text-xs text-zinc-500 mb-1 block">To Date</label>
                                <input
                                    id="filter-date-to"
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            {/* Amount range */}
                            <div>
                                <label htmlFor="filter-amount-min" className="text-xs text-zinc-500 mb-1 block">Min Amount ($)</label>
                                <input
                                    id="filter-amount-min"
                                    type="number"
                                    value={amountMin}
                                    onChange={(e) => setAmountMin(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label htmlFor="filter-amount-max" className="text-xs text-zinc-500 mb-1 block">Max Amount ($)</label>
                                <input
                                    id="filter-amount-max"
                                    type="number"
                                    value={amountMax}
                                    onChange={(e) => setAmountMax(e.target.value)}
                                    placeholder="999.99"
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            {/* Category */}
                            <div className="md:col-span-2">
                                <label htmlFor="filter-category" className="text-xs text-zinc-500 mb-1 block">Category</label>
                                <select
                                    id="filter-category"
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    title="Filter by category"
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                >
                                    <option value="">All Categories</option>
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                <TransactionsTable
                    ref={tableRef}
                    filter={filter}
                    searchQuery={searchQuery}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    amountMin={amountMin ? (isNaN(parseFloat(amountMin)) ? undefined : parseFloat(amountMin)) : undefined}
                    amountMax={amountMax ? (isNaN(parseFloat(amountMax)) ? undefined : parseFloat(amountMax)) : undefined}
                    categoryFilter={categoryFilter}
                />

                <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
                    <p className="text-xs text-zinc-500">Showing transactions based on filters</p>
                </div>
            </div>
        </PageTransition>
    );
}
