import { NextResponse } from 'next/server';
import { geminiClient } from '@/lib/gemini';
import { createClient } from '@/utils/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { history, force } = await request.json();

        if (!Array.isArray(history) || history.length === 0) {
            return NextResponse.json({ error: 'Transaction history is required' }, { status: 400 });
        }

        // Check for recent forecast (e.g., last 24 hours)
        const { data: recentForecast } = await supabase
            .from('forecasts')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

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

        const forecast = await geminiClient.generateForecast(history);

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
