import type { Transaction, Forecast, PlaidAccount, PredictedTransaction, ForecastTimelinePoint } from '@/types';

interface TransactionsResponse {
    transactions: Transaction[];
    accounts: PlaidAccount[];
}

export async function fetchTransactions(force = false): Promise<TransactionsResponse> {
    const url = force ? '/api/transactions?force=true' : '/api/transactions';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json();
}

export async function fetchForecast(history: Transaction[] = [], force = false): Promise<Forecast> {
    const res = await fetch('/api/forecast', {
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

    // 2. Generate a continuous 90-day timeline starting from tomorrow
    const today = new Date();
    const timeline: ForecastTimelinePoint[] = [];

    for (let i = 1; i <= 90; i++) {
        const dateObj = new Date(today);
        dateObj.setDate(today.getDate() + i);
        const dateStr = dateObj.toISOString().split('T')[0];

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
