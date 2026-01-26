"use client";

import { useState, useEffect } from "react";
import { BalanceChart } from "@/components/BalanceChart";
import { QuickGlance } from "@/components/QuickGlance";
import { RecentTransactions } from "@/components/RecentTransactions";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import { AISuggestions } from "@/components/AISuggestions";
import { useRouter } from "next/navigation";

export default function Home() {
  const { loadingStage, transactions, forecast, balance } = useSync();
  const [forecastDays, setForecastDays] = useState(30);
  const [displayName, setDisplayName] = useState("User");
  const [email, setEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/scenarios?prompt=${encodeURIComponent(searchQuery)}`);
    }
  };

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.email) {
          setEmail(data.email);
          // Default to display_name, fallback to email prefix
          const defaultName = data.display_name || data.email.split('@')[0];
          // Capitalize first letter of email prefix if used
          setDisplayName(defaultName.charAt(0).toUpperCase() + defaultName.slice(1));
        }
      })
      .catch(err => console.error("Failed to fetch user settings", err));
  }, []);

  const handleNameUpdate = async () => {
    if (!displayName.trim()) return;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName })
      });
    } catch (error) {
      console.error("Failed to save name", error);
    }
  };

  if (loadingStage === 'transactions' && transactions.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-zinc-400">Syncing your financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-white">Hello,</h1>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={handleNameUpdate}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="bg-transparent text-3xl font-bold text-white focus:outline-none focus:border-b-2 focus:border-blue-500 w-auto min-w-[100px]"
            />
          </div>
          <p className="text-zinc-400">Here is your financial forecast for today.</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm text-zinc-400">Total Balance</p>
            <p className="text-2xl font-bold text-white">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* AI Input Section */}
      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Sparkles className="h-5 w-5 text-blue-500" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Hi, what can I help you model today? (e.g., 'Can I afford a trip to Japan?')"
          className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/50 py-4 pl-12 pr-4 text-zinc-100 placeholder-zinc-500 backdrop-blur-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="absolute inset-y-0 right-4 flex items-center">
          <button
            onClick={handleSearch}
            className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-500 transition-colors"
          >
            <Search size={18} />
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart Section */}
        <div className="lg:col-span-2">
          <div className="glass-card rounded-2xl p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Projected Balance ({forecastDays} Days)</h2>
              <select
                value={forecastDays}
                onChange={(e) => setForecastDays(Number(e.target.value))}
                className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-300 border-none outline-none"
              >
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
            {/* Pass forecast data to BalanceChart if available, or it can read from context too if updated */}
            <BalanceChart days={forecastDays} />
          </div>
        </div>

        {/* Quick Glance Section */}
        <div className="lg:col-span-1">
          <div className="glass-card h-full rounded-2xl p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Upcoming Forecast</h2>
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Upcoming transactions based on your history.</p>
              <QuickGlance />
              <button className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors">
                View Full Forecast
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity & Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Recent Activity</h2>
          <RecentTransactions />
        </div>

        {/* AI Insights */}
        {/* AI Insights */}
        <div>
          <AISuggestions />
        </div>
      </div>
    </div>
  );
}
