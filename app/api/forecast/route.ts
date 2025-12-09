import { NextResponse } from 'next/server';
import { geminiClient } from '@/lib/gemini';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { history, force } = await request.json();

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
            console.log("Serving forecast from cache");
            return NextResponse.json(recentForecast.forecast_data);
        }

        console.log(`Generating new forecast (Cache Stale/Empty) with ${history.length} transactions`);
        const forecast = await geminiClient.generateForecast(history);

        // Save to Supabase
        await supabase.from('forecasts').insert({
            user_id: user.id,
            forecast_data: forecast
        });

        return NextResponse.json(forecast);
    } catch (error) {
        console.error('Error generating forecast:', error);
        return NextResponse.json({ error: 'Failed to generate forecast' }, { status: 500 });
    }
}
