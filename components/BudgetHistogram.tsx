"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useEffect, useState } from "react";
import { useSync } from "@/contexts/SyncContext";
import { inferCategory } from "@/lib/categories";
import type { Transaction, CategoryBucket } from "@/types";

export function BudgetHistogram({ transactions: propTransactions }: { transactions?: Transaction[] }) {
    const { transactions: contextTransactions } = useSync();
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // "This Month" data source (Mixed Actuals + Forecast if provided, else just Actuals from context)
    const transactions = propTransactions || contextTransactions;
    // "History" data source (Always Actuals from context)
    const historicalTransactions = contextTransactions;

    if (!mounted || !transactions) return <div className="h-[300px] w-full flex items-center justify-center text-zinc-500">Loading...</div>;

    // Calculate monthly totals by category
    const now = new Date();
    const currentMonth = now.getMonth();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const currentYear = now.getFullYear();
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const totals: Record<string, CategoryBucket> = {};

    // 1. Process "This Month"
    transactions.forEach((tx) => {
        const date = new Date(tx.date);
        const month = date.getMonth();
        const year = date.getFullYear();

        // If propTransactions is provided (from BudgetPage), it is already a list of "current month data".
        // But if it is contextTransactions, we must filter.

        // Safety check for current month/year, although propTransactions should be pre-filtered by BudgetPage mostly.
        // BudgetPage sends "combinedTransactions" which is strictly current month.
        if (month === currentMonth && year === currentYear && tx.amount > 0) {
            const category = inferCategory(tx);
            if (!totals[category]) totals[category] = { name: category, thisMonth: 0, lastMonth: 0 };
            totals[category].thisMonth += Math.abs(tx.amount);
        }
    });

    // 2. Process "Last Month"
    if (historicalTransactions) {
        historicalTransactions.forEach((tx) => {
            if (tx.amount > 0) {
                const date = new Date(tx.date);
                const month = date.getMonth();
                const year = date.getFullYear();

                if (month === lastMonth && year === lastMonthYear) {
                    const category = inferCategory(tx);
                    if (!totals[category]) totals[category] = { name: category, thisMonth: 0, lastMonth: 0 };
                    totals[category].lastMonth += tx.amount;
                }
            }
        });
    }

    const data = Object.values(totals)
        .sort((a, b) => (b.thisMonth + b.lastMonth) - (a.thisMonth + a.lastMonth))
        .slice(0, 5);

    if (data.length === 0) return <div className="h-[300px] w-full flex items-center justify-center text-zinc-500">No data available for comparison</div>;

    return (
        <div className="h-[300px] w-full min-h-[100px] min-w-[100px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                    <XAxis type="number" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                        contentStyle={{
                            backgroundColor: "#18181b",
                            border: "1px solid #27272a",
                            borderRadius: "8px",
                            zIndex: 1000
                        }}
                        wrapperStyle={{ zIndex: 1000 }}
                        itemStyle={{ color: "#fff" }}
                    />
                    <Bar dataKey="thisMonth" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                    <Bar dataKey="lastMonth" fill="#3f3f46" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
