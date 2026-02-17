"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LineChart, PieChart, MessageSquare, CreditCard, Wallet, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { PlaidLink } from "./PlaidLink";
import { useSync } from "@/contexts/SyncContext";
import { RefreshCw, LogOut } from "lucide-react";
import { signout } from "@/app/login/actions";
import { useState, useEffect, useMemo } from "react";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, badgeKey: null },
  { name: "Forecast Hub", href: "/forecast", icon: LineChart, badgeKey: null },
  { name: "Budget Tracker", href: "/budget", icon: PieChart, badgeKey: "budget" as const },
  { name: "Scenario Planner", href: "/scenarios", icon: MessageSquare, badgeKey: null },
  { name: "Transactions", href: "/transactions", icon: CreditCard, badgeKey: "transactions" as const },
  { name: "Settings", href: "/settings", icon: Settings, badgeKey: null },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const { triggerUpdate, isSyncing, syncProgress, balance, accounts, error, loadingStage, transactions, lastUpdated } = useSync();
  const [collapsed, setCollapsed] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  // Load collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("arc-sidebar-collapsed");
      if (saved === "true") setCollapsed(true);
    } catch { /* restricted storage context */ }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try { localStorage.setItem("arc-sidebar-collapsed", String(!v)); } catch { /* ignore */ }
      return !v;
    });
  };

  // Badge: detect new transactions (transactions updated recently)
  const [seenTxCount, setSeenTxCount] = useState<number | null>(null);
  const hasNewTransactions = useMemo(() => {
    if (seenTxCount === null) return false;
    return transactions.length > seenTxCount;
  }, [transactions.length, seenTxCount]);

  // Mark transactions as seen when visiting the transactions page
  useEffect(() => {
    if (seenTxCount === null && transactions.length > 0) {
      const stored = parseInt((function() { try { return localStorage.getItem("arc-seen-tx-count") || "0"; } catch { return "0"; } })(), 10);
      setSeenTxCount(stored);
    }
    if (pathname === "/transactions" && transactions.length > 0) {
      setSeenTxCount(transactions.length);
      try { localStorage.setItem("arc-seen-tx-count", String(transactions.length)); } catch { /* ignore */ }
    }
  }, [pathname, transactions.length, seenTxCount]);

  // Compute badges
  const badges: Record<string, boolean> = {
    transactions: hasNewTransactions,
  };

  // Onboarding mode: Data loaded but no transactions AND no accounts connected
  // Check accounts.length instead of balance === 0 to avoid false positive
  // for users who genuinely have $0 across linked accounts.
  const isOnboarding = loadingStage === 'complete' &&
    (!transactions || transactions.length === 0) &&
    accounts.length === 0;

  return (
    // Removed "transition-transform" to ensure fixed overlay works correctly relative to viewport
    // Elevate z-index to 60 during onboarding to sit above the global overlay (z-55)
    <aside
      role="navigation"
      aria-label="Main navigation"
      className={clsx(
      "sticky top-0 h-screen flex-shrink-0 border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-xl transition-all duration-300",
      collapsed ? "w-[68px]" : "w-64",
      isOnboarding ? "z-[60]" : "z-40"
    )}>
      {/* Onboarding Overlay */}
      {isOnboarding && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] transition-opacity duration-500 animate-in fade-in" />
      )}

      <div className="flex h-full flex-col px-3 py-4">
        <div className={clsx("mb-10 flex items-center", collapsed ? "justify-center px-0" : "px-2 pl-4")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          {!collapsed && (
            <span className="ml-3 text-xl font-bold tracking-tight text-white">
              Arc
            </span>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mx-auto mb-4 text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 rounded-lg hover:bg-zinc-800"
            title="Expand sidebar"
          >
            <ChevronRight size={16} />
          </button>
        )}

        <ul className="space-y-2 font-medium" role="list" aria-label="Navigation links">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.name : undefined}
                  className={twMerge(
                    clsx(
                      "group relative flex items-center rounded-xl text-sm transition-all duration-200",
                      collapsed ? "justify-center px-3 py-3" : "px-4 py-3",
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
                  {!collapsed && <span className="ml-3">{item.name}</span>}
                  {/* Notification badge */}
                  {item.badgeKey && badges[item.badgeKey] && (
                    <span className={clsx(
                      "absolute h-2 w-2 rounded-full bg-rose-500 ring-2 ring-zinc-950",
                      collapsed ? "top-2 right-2" : "top-2.5 left-8"
                    )} />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto px-2 pb-4 space-y-4">
          {!collapsed && (
            <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 border border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAccounts(!showAccounts)}
                aria-expanded={showAccounts}
                aria-label="Toggle account details"
                className="w-full text-left"
              >
                <p className="text-xs font-medium text-zinc-400">Current Balance</p>
                <p className="mt-1 text-lg font-bold text-white">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full w-[70%] bg-gradient-to-r from-blue-500 to-violet-500" />
                </div>
                {accounts.length > 1 && (
                  <p className="mt-2 text-[10px] text-zinc-600">{accounts.length} accounts · Click to {showAccounts ? 'hide' : 'view'}</p>
                )}
              </button>
              {showAccounts && accounts.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                  {accounts.map((acc, i: number) => (
                    <div key={acc.account_id || i} className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-300 truncate">{acc.official_name || acc.name}</p>
                        <p className="text-[10px] text-zinc-600 capitalize">{acc.subtype || acc.type}{acc.mask ? ` ••${acc.mask}` : ''}</p>
                      </div>
                      <p className={clsx("text-xs font-medium ml-2", (acc.type === 'credit' || acc.type === 'loan') ? 'text-rose-400' : 'text-emerald-400')}>
                        {(acc.type === 'credit' || acc.type === 'loan') ? '−' : ''}${Math.abs(acc.balances?.current || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {/* Spotlight Container for Connect Button */}
            {!collapsed && (
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
            )}

            <button
              type="button"
              onClick={() => triggerUpdate()}
              disabled={isSyncing}
              title={collapsed ? "Update Forecasts" : undefined}
              className={clsx(
                "w-full rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2",
                collapsed ? "px-2 py-2" : "px-4 py-2"
              )}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {!collapsed && <>Updating... {syncProgress}%</>}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {!collapsed && "Update Forecasts"}
                </>
              )}
            </button>
            {error && !collapsed && (
              <p className="text-xs text-rose-500 text-center px-2">{error}</p>
            )}

            <form action={signout}>
              <button
                type="submit"
                title={collapsed ? "Sign Out" : undefined}
                className={clsx(
                  "w-full rounded-xl border border-zinc-800 text-sm font-medium text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all flex items-center justify-center gap-2",
                  collapsed ? "px-2 py-2" : "px-4 py-2"
                )}
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && "Sign Out"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
