"use client";

import { ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { useEffect, useState } from "react";
import { processForecastData } from "@/lib/api";
import { useSync } from "@/contexts/SyncContext";
import { SkeletonChart } from "@/components/Skeleton";

export function BalanceChart({ className = "h-[200px]", days = 30 }: { className?: string, days?: number }) {
    const { forecast, loadingStage, balance } = useSync();
    const [data, setData] = useState<import("@/types").ForecastTimelinePoint[]>([]);

    useEffect(() => {
        if (forecast) {
            const processed = processForecastData(forecast, balance);
            setData(processed.slice(0, days));
        }
    }, [forecast, balance, days]);

    // Ensure component is mounted to avoid hydration mismatch and size issues
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || loadingStage === 'transactions' || loadingStage === 'forecast') {
        return <SkeletonChart className={className} />;
    }

    if (!forecast || data.length === 0) {
        return <SkeletonChart className={className} />;
    }

    return (
        <div className={`${className} w-full min-h-[100px] min-w-[100px]`}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="day"
                        stroke="#52525b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
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
                            padding: "8px 12px",
                        }}
                        itemStyle={{ color: "#fff" }}
                        labelStyle={{ color: "#a1a1aa", marginBottom: "4px", fontSize: "12px" }}
                        formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, "Balance"]}
                        labelFormatter={(label) => `Date: ${label}`}
                        cursor={{ stroke: "#3b82f6", strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <Area
                        type="monotone"
                        dataKey="balance"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorBalance)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
