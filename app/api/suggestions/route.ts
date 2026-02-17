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

    // Rate limit check
    const rateCheck = checkRateLimit(`suggestions:${user.id}`, RATE_LIMITS.suggestions);
    if (!rateCheck.allowed) {
        return NextResponse.json(
            { error: `Rate limit exceeded. Try again in ${rateCheck.resetIn}s.` },
            { status: 429, headers: { 'Retry-After': String(rateCheck.resetIn) } }
        );
    }

    try {
        const { history, forecast } = await request.json();

        if (!history || !forecast) {
            return NextResponse.json({ error: 'Missing history or forecast data' }, { status: 400 });
        }

        const suggestionsData = await geminiClient.generateSuggestions(history, forecast);
        const suggestions = suggestionsData.suggestions || [];

        // Clean up old suggestions — keep only the latest 3 per user
        const { data: oldRows } = await supabase
            .from('ai_suggestions')
            .select('id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (oldRows && oldRows.length >= 3) {
            const idsToDelete = oldRows.slice(2).map(r => r.id);
            await supabase.from('ai_suggestions').delete().in('id', idsToDelete);
        }

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
