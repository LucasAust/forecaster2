import type { Transaction, Forecast, PlaidAccount, PredictedTransaction, ForecastTimelinePoint } from '@/types';

// ─── Auth-aware fetch wrapper ────────────────────────────────
// Intercepts 401 (Unauthorized) responses from API routes and
// redirects the browser to /login so stale sessions never show
// raw errors to the user.

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init);
    if (res.status === 401) {
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        // Throw so callers don't try to parse the 401 body
        throw new Error('Session expired — redirecting to login');
    }
    return res;
}

interface TransactionsResponse {
    transactions: Transaction[];
    accounts: PlaidAccount[];
    /** True when the user has at least one Plaid item linked, even with no transactions yet */
    hasLinkedBank?: boolean;
    /** Item IDs that need re-authentication via Plaid Link update mode */
    requiresReauth?: string[];
}

export async function fetchTransactions(force = false): Promise<TransactionsResponse> {
    const url = force ? '/api/transactions?force=true' : '/api/transactions';
    const res = await authFetch(url);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json();
}

export async function fetchForecast(history: Transaction[] = [], force = false): Promise<Forecast> {
    const res = await authFetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, force }),
    });
    if (!res.ok) throw new Error('Failed to fetch forecast');
    return res.json();
}

interface DailyBucket {
    date: string;
    income: number;
    expenses: number;
    transactions: PredictedTransaction[];
}

export function processForecastData(forecast: Forecast, currentBalance: number): ForecastTimelinePoint[] {
    let runningBalance = currentBalance;
    let cumulativeExpenses = 0;
    let cumulativeIncome = 0;

    // 1. Group transactions by date
    const dailyData: Record<string, DailyBucket> = {};
    for (const tx of forecast.predicted_transactions) {
        const date = tx.date;
        if (!dailyData[date]) {
            dailyData[date] = { date, income: 0, expenses: 0, transactions: [] };
        }
        if (tx.amount > 0) {
            dailyData[date].income += tx.amount;
        } else {
            dailyData[date].expenses += Math.abs(tx.amount);
        }
        dailyData[date].transactions.push(tx);
    }

    // 2. Generate a continuous 90-day timeline starting from tomorrow.
    // Use noon-anchored local dates (matching the engine's parseDate convention)
    // to avoid UTC-vs-local drift that can shift dates by 1 day after ~5pm
    // in US timezones.
    const today = new Date();
    today.setHours(12, 0, 0, 0); // Anchor to noon, same as engine's parseDate
    const timeline: ForecastTimelinePoint[] = [];

    for (let i = 1; i <= 90; i++) {
        const dateObj = new Date(today);
        dateObj.setDate(today.getDate() + i);
        // Format as YYYY-MM-DD using local date components, not toISOString() (which is UTC)
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const dayData = dailyData[dateStr] || { income: 0, expenses: 0, transactions: [] };

        runningBalance += dayData.income - dayData.expenses;
        cumulativeIncome += dayData.income;
        cumulativeExpenses += dayData.expenses;

        timeline.push({
            day: dateObj.getDate().toString(),
            fullDate: dateStr,
            balance: runningBalance,
            income: cumulativeIncome,
            expenses: cumulativeExpenses,
            dailyIncome: dayData.income,
            dailyExpenses: dayData.expenses,
            transactions: dayData.transactions
        });
    }

    return timeline;
}
