"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from "recharts";
import { useEffect, useState } from "react";
import { useSync } from "@/contexts/SyncContext";
import { processForecastData } from "@/lib/api";

export function ForecastGraph({ days = 30 }: { days?: number }) {
    const { forecast, balance, loadingStage } = useSync();
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {
        if (forecast) {
            const processed = processForecastData(forecast, balance);
            setData(processed.slice(0, days));
        }
    }, [forecast, balance, days]);

    if (loadingStage === 'forecast') return <div className="h-[400px] w-full flex items-center justify-center text-zinc-500">Loading forecast...</div>;

    if (!forecast) return (
        <div className="h-[400px] w-full flex flex-col items-center justify-center text-zinc-500">
            <p>No forecast available</p>
            <p className="text-xs mt-1">Connect a bank account to generate predictions</p>
        </div>
    );

    return (
        <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                        dataKey="day"
                        stroke="#52525b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                    />
                    <YAxis
                        stroke="#52525b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                            new Intl.NumberFormat('en-US', {
                                notation: "compact",
                                maximumFractionDigits: 1
                            }).format(value)
                        }
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "#18181b",
                            border: "1px solid #27272a",
                            borderRadius: "8px",
                        }}
                        itemStyle={{ color: "#fff" }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
                    />
                    <Legend wrapperStyle={{ paddingTop: "20px" }} />
                    <Line
                        type="monotone"
                        dataKey="balance"
                        name="Total Balance"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="expenses"
                        name="Cumulative Expenses"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="income"
                        name="Cumulative Income"
                        stroke="#10b981"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
