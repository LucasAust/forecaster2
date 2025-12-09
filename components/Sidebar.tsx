"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LineChart, PieChart, MessageSquare, CreditCard, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { PlaidLink } from "./PlaidLink";
import { useSync } from "@/contexts/SyncContext";
import { RefreshCw, LogOut } from "lucide-react";
import { signout } from "@/app/login/actions";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Forecast Hub", href: "/forecast", icon: LineChart },
  { name: "Budget Tracker", href: "/budget", icon: PieChart },
  { name: "Scenario Planner", href: "/scenarios", icon: MessageSquare },
  { name: "Transactions", href: "/transactions", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();
  const { triggerUpdate, isSyncing, syncProgress, balance, error, loadingStage, transactions } = useSync();

  // Onboarding mode: Data loaded but no transactions found
  const isOnboarding = loadingStage === 'complete' && (!transactions || transactions.length === 0);

  return (
    // Removed "transition-transform" to ensure fixed overlay works correctly relative to viewport
    // Elevate z-index to 60 during onboarding to sit above the global overlay (z-55)
    <aside className={clsx(
      "sticky top-0 h-screen w-64 flex-shrink-0 border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-xl",
      isOnboarding ? "z-[60]" : "z-40"
    )}>
      {/* Onboarding Overlay */}
      {isOnboarding && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] transition-opacity duration-500 animate-in fade-in" />
      )}

      <div className="flex h-full flex-col px-3 py-4">
        <div className="mb-10 flex items-center px-2 pl-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <span className="ml-3 text-xl font-bold tracking-tight text-white">
            Arc
          </span>
        </div>

        <ul className="space-y-2 font-medium">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={twMerge(
                    clsx(
                      "group flex items-center rounded-xl px-4 py-3 text-sm transition-all duration-200",
                      isActive
                        ? "bg-blue-600/10 text-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                    )
                  )}
                >
                  <item.icon
                    className={clsx(
                      "h-5 w-5 transition-colors",
                      isActive ? "text-blue-500" : "text-zinc-500 group-hover:text-zinc-100"
                    )}
                  />
                  <span className="ml-3">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto px-4 pb-4 space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 border border-zinc-800">
            <p className="text-xs font-medium text-zinc-400">Current Balance</p>
            <p className="mt-1 text-lg font-bold text-white">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-[70%] bg-gradient-to-r from-blue-500 to-violet-500" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Spotlight Container for Connect Button */}
            <div className={clsx("flex justify-center transition-all duration-500", isOnboarding ? "relative z-[60] scale-110" : "")}>
              <PlaidLink />

              {/* Onboarding Tooltip */}
              {isOnboarding && (
                <div className="absolute left-full top-1/2 ml-6 w-64 -translate-y-1/2 transform">
                  <div className="relative rounded-xl bg-blue-600 p-4 shadow-[0_0_30px_rgba(37,99,235,0.3)] animate-in fade-in slide-in-from-left-4 duration-700">
                    {/* Arrow */}
                    <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 bg-blue-600"></div>
                    <h3 className="mb-1 font-bold text-white">Get Started</h3>
                    <p className="text-sm text-blue-50">Click here to connect your first account and activate your forecast.</p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => triggerUpdate()}
              disabled={isSyncing}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Updating... {syncProgress}%
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Update Forecasts
                </>
              )}
            </button>
            {error && (
              <p className="text-xs text-rose-500 text-center px-2">{error}</p>
            )}

            <form action={signout}>
              <button
                type="submit"
                className="w-full rounded-xl border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
