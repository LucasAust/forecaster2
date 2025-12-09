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
        const { history, forecast } = await request.json();

        if (!history || !forecast) {
            return NextResponse.json({ error: 'Missing history or forecast data' }, { status: 400 });
        }

        console.log("Generating AI suggestions...");
        const suggestionsData = await geminiClient.generateSuggestions(history, forecast);
        const suggestions = suggestionsData.suggestions || [];

        // Save to DB
        // Check if exists first to update, or just upsert?
        // Since we want one row per user (or history?), let's say one row for "latest suggestions".
        // The table has `id` PK. We can query by `user_id`.

        // Let's delete old ones or update? Or just a single row per user strategy?
        // Schema doesn't enforce single row. But for simplicity let's keep one "latest" row or just insert new ones and query latest.
        // Query logic: `order('created_at', { ascending: false }).limit(1)`

        await supabase.from('ai_suggestions').insert({
            user_id: user.id,
            suggestions: suggestions
        });

        return NextResponse.json({ suggestions });
    } catch (error) {
        console.error('Error generating suggestions:', error);
        return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data, error } = await supabase
            .from('ai_suggestions')
            .select('suggestions, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
            throw error;
        }

        return NextResponse.json({
            suggestions: data?.suggestions || [],
            lastUpdated: data?.created_at
        });

    } catch (error) {
        console.error('Error fetching suggestions:', error);
        return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
    }
}
