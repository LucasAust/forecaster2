import { NextResponse } from 'next/server';
import { geminiClient } from '@/lib/gemini';
import { createClient } from '@/utils/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import type { Transaction } from '@/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeHistory(input: unknown): Transaction[] {
    if (!Array.isArray(input)) return [];

    const safe: Transaction[] = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') continue;
        const tx = item as Partial<Transaction>;
        if (typeof tx.transaction_id !== 'string' || tx.transaction_id.trim().length === 0) continue;
        if (typeof tx.account_id !== 'string' || tx.account_id.trim().length === 0) continue;
        if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount) || tx.amount === 0) continue;
        if (typeof tx.date !== 'string' || !DATE_RE.test(tx.date)) continue;

        safe.push({
            transaction_id: tx.transaction_id,
            account_id: tx.account_id,
            amount: tx.amount,
            date: tx.date,
            name: typeof tx.name === 'string' && tx.name.trim().length > 0 ? tx.name : 'Transaction',
            merchant_name: typeof tx.merchant_name === 'string' ? tx.merchant_name : undefined,
            category: tx.category ?? null,
            pending: Boolean(tx.pending),
            logo_url: tx.logo_url ?? null,
            authorized_date: typeof tx.authorized_date === 'string' ? tx.authorized_date : undefined,
            user_id: typeof tx.user_id === 'string' ? tx.user_id : undefined,
        });
    }

    return safe.slice(0, 5000);
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { history, force, useGeminiRefinement } = await request.json();
        const safeHistory = sanitizeHistory(history);

        if (safeHistory.length === 0) {
            return NextResponse.json({ error: 'Transaction history is required' }, { status: 400 });
        }

        // Check for recent forecast (e.g., last 24 hours)
        const { data: recentForecast } = await supabase
            .from('forecasts')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        if (!force && recentForecast && new Date(recentForecast.created_at) > twentyFourHoursAgo) {
            return NextResponse.json(recentForecast.forecast_data);
        }

        // Rate limit only when generating (not serving cache)
        const rateCheck = checkRateLimit(`forecast:${user.id}`, RATE_LIMITS.forecast);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: `Rate limit exceeded. Try again in ${rateCheck.resetIn}s.` },
                { status: 429, headers: { 'Retry-After': String(rateCheck.resetIn) } }
            );
        }

        const forecast = await geminiClient.generateForecast(safeHistory, useGeminiRefinement !== false);

        // Save to Supabase
        await supabase.from('forecasts').insert({
            user_id: user.id,
            forecast_data: forecast
        });

        // Cleanup: keep only the 5 most recent forecasts per user
        const { data: oldForecasts } = await supabase
            .from('forecasts')
            .select('id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (oldForecasts && oldForecasts.length > 5) {
            const idsToDelete = oldForecasts.slice(5).map((r: { id: string }) => r.id);
            await supabase.from('forecasts').delete().in('id', idsToDelete);
        }

        return NextResponse.json(forecast);
    } catch (error) {
        console.error('Error generating forecast:', error);
        return NextResponse.json({ error: 'Failed to generate forecast' }, { status: 500 });
    }
}
