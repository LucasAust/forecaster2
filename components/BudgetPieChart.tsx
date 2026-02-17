"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useEffect, useState } from "react";
import { useSync } from "@/contexts/SyncContext";
import { inferCategory } from "@/lib/categories";
import type { Transaction } from "@/types";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e"];

export function BudgetPieChart({ transactions: propTransactions }: { transactions?: Transaction[] }) {
    const { transactions: contextTransactions } = useSync();
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // Use props if available, otherwise default to context (but filter for current month if using context for consistency with budget page?)
    // actually, if passed from BudgetPage, it's already filtered. If falling back to context, we should probably filter for "current month".

    const rawTransactions = propTransactions || contextTransactions || [];

    // If we are using context transactions directly (no prop), filter for current month
    const transactions = propTransactions ? propTransactions : rawTransactions.filter((tx) => {
        const date = new Date(tx.date);
        const now = new Date();
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    // Calculate category totals
    const categoryTotals = transactions.reduce<Record<string, number>>((acc, tx) => {
        if (tx.amount > 0) { // Only expenses
            const category = inferCategory(tx);
            acc[category] = (acc[category] || 0) + tx.amount;
        }
        return acc;
    }, {});

    const data = Object.keys(categoryTotals)
        .map(name => ({ name, value: categoryTotals[name] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5); // Top 5 categories

    if (!mounted) return <div className="h-[300px] w-full flex items-center justify-center text-zinc-500">Loading...</div>;

    if (data.length === 0) return <div className="h-[300px] w-full flex items-center justify-center text-zinc-500">No expense data for this month</div>;

    return (
        <div className="h-[300px] w-full min-h-[100px] min-w-[100px]">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                        ))}
                    </Pie>
                    <Tooltip
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
                    <Legend
                        layout="vertical"
                        verticalAlign="middle"
                        align="right"
                        wrapperStyle={{ paddingLeft: "20px" }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
