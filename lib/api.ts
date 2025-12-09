export async function fetchTransactions(force = false) {
    const url = force ? '/api/transactions?force=true' : '/api/transactions';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    const data = await res.json();
    return data; // Returns { transactions: [], accounts: [] }
}

export async function fetchForecast(history: any[] = [], force = false) {
    const res = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, force }),
    });
    if (!res.ok) throw new Error('Failed to fetch forecast');
    const data = await res.json();
    return data;
}

export function processForecastData(forecast: any, currentBalance: number) {
    let runningBalance = currentBalance;
    let cumulativeExpenses = 0;
    let cumulativeIncome = 0;

    // 1. Group transactions by date
    const dailyData = forecast.predicted_transactions.reduce((acc: any, tx: any) => {
        const date = tx.date;
        if (!acc[date]) {
            acc[date] = { date, income: 0, expenses: 0, transactions: [] };
        }
        if (tx.amount > 0) {
            acc[date].income += tx.amount;
        } else {
            acc[date].expenses += Math.abs(tx.amount);
        }
        acc[date].transactions.push(tx);
        return acc;
    }, {});

    // 2. Generate a continuous 90-day timeline starting from tomorrow
    const today = new Date();
    const timeline = [];

    for (let i = 1; i <= 90; i++) {
        const dateObj = new Date(today);
        dateObj.setDate(today.getDate() + i);
        const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD

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
