import { generateDeterministicForecast, validateForecast } from "../lib/forecast-engine";
import type { Forecast, Transaction } from "../types";

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function dateISO(d: Date): string {
    return d.toISOString().split("T")[0];
}

function addDays(d: Date, days: number): Date {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
}

function tx(partial: Partial<Transaction> & Pick<Transaction, "transaction_id" | "account_id" | "amount" | "date" | "name">): Transaction {
    return {
        transaction_id: partial.transaction_id,
        account_id: partial.account_id,
        amount: partial.amount,
        date: partial.date,
        name: partial.name,
        merchant_name: partial.merchant_name,
        category: partial.category ?? null,
        pending: partial.pending ?? false,
        logo_url: null,
    };
}

function buildHistory(): Transaction[] {
    const today = new Date();
    const rows: Transaction[] = [];

    for (let i = 1; i <= 7; i++) {
        rows.push(
            tx({
                transaction_id: `payroll-${i}`,
                account_id: "checking",
                amount: -2200,
                date: dateISO(addDays(today, -(i * 14))),
                name: "ACME Payroll",
                merchant_name: "ACME Payroll",
                category: ["Income"],
            })
        );
    }

    for (let i = 1; i <= 6; i++) {
        rows.push(
            tx({
                transaction_id: `rent-${i}`,
                account_id: "checking",
                amount: 1650,
                date: dateISO(addDays(today, -(i * 30))),
                name: "Rent Payment",
                merchant_name: "Main Street Apartments",
                category: ["Housing"],
            })
        );
    }

    for (let i = 1; i <= 20; i++) {
        rows.push(
            tx({
                transaction_id: `grocery-${i}`,
                account_id: "checking",
                amount: 35 + (i % 5) * 12,
                date: dateISO(addDays(today, -(i * 3))),
                name: "Fresh Market",
                merchant_name: "Fresh Market",
                category: ["Food & Drink"],
            })
        );
    }

    rows.push(
        tx({
            transaction_id: "oneoff-1",
            account_id: "card",
            amount: 420,
            date: dateISO(addDays(today, -7)),
            name: "Premium Luggage",
            merchant_name: "Premium Luggage",
            category: ["Shopping"],
        }),
        tx({
            transaction_id: "oneoff-2",
            account_id: "card",
            amount: 380,
            date: dateISO(addDays(today, -4)),
            name: "Premium Luggage",
            merchant_name: "Premium Luggage",
            category: ["Shopping"],
        }),
        tx({
            transaction_id: "oneoff-3",
            account_id: "card",
            amount: 310,
            date: dateISO(addDays(today, -1)),
            name: "Premium Luggage",
            merchant_name: "Premium Luggage",
            category: ["Shopping"],
        })
    );

    rows.push(
        tx({
            transaction_id: "gig-1",
            account_id: "checking",
            amount: -145,
            date: dateISO(addDays(today, -5)),
            name: "Side Hustle A",
            merchant_name: "Side Hustle A",
            category: ["Income"],
        }),
        tx({
            transaction_id: "gig-2",
            account_id: "checking",
            amount: -120,
            date: dateISO(addDays(today, -12)),
            name: "Side Hustle B",
            merchant_name: "Side Hustle B",
            category: ["Income"],
        }),
        tx({
            transaction_id: "gig-3",
            account_id: "checking",
            amount: -160,
            date: dateISO(addDays(today, -18)),
            name: "Side Hustle C",
            merchant_name: "Side Hustle C",
            category: ["Income"],
        })
    );

    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function assertForecastShape(forecast: Forecast): void {
    const today = new Date();
    const minDate = dateISO(addDays(today, 1));
    const maxDate = dateISO(addDays(today, 91));

    assert(Array.isArray(forecast.predicted_transactions), "predicted_transactions must be an array");
    const seen = new Set<string>();

    for (const tx of forecast.predicted_transactions) {
        assert(typeof tx.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tx.date), "each transaction must have a valid date");
        assert(tx.date >= minDate && tx.date <= maxDate, "forecast dates must stay inside 90-day window");
        assert(typeof tx.merchant === "string" && tx.merchant.trim().length > 0, "merchant cannot be blank");
        assert(typeof tx.category === "string" && tx.category.trim().length > 0, "category cannot be blank");
        assert(typeof tx.amount === "number" && Number.isFinite(tx.amount) && tx.amount !== 0, "amount must be finite and non-zero");
        const key = `${tx.date}|${tx.merchant}|${Math.round(tx.amount * 100)}`;
        assert(!seen.has(key), "forecast should not contain duplicate transactions");
        seen.add(key);
    }
}

function main(): void {
    const history = buildHistory();
    const rawForecast = generateDeterministicForecast(history);
    const forecast = validateForecast(rawForecast);

    assertForecastShape(forecast);

    const merchants = forecast.predicted_transactions.map((t) => t.merchant.toLowerCase());
    assert(!merchants.some((m) => m.includes("premium luggage")), "sparse one-off shopping should not be projected as recurring");
    assert(!merchants.some((m) => m.includes("side hustle")), "fragmented low-evidence income should not be projected");
    assert(merchants.some((m) => m.includes("main street apartments")), "monthly rent recurring series should be projected");
    assert(merchants.some((m) => m.includes("acme payroll")), "payroll recurring income should be projected");

    const incomeCount = forecast.predicted_transactions.filter((t) => t.type === "income").length;
    const expenseCount = forecast.predicted_transactions.filter((t) => t.type === "expense").length;

    console.log("Forecast audit passed");
    console.log(`Predicted transactions: ${forecast.predicted_transactions.length}`);
    console.log(`Income: ${incomeCount}, Expenses: ${expenseCount}`);
}

main();
