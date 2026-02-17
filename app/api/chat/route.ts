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
    const rateCheck = checkRateLimit(`chat:${user.id}`, RATE_LIMITS.chat);
    if (!rateCheck.allowed) {
        return NextResponse.json(
            { error: `Rate limit exceeded. Try again in ${rateCheck.resetIn}s.` },
            { status: 429, headers: { 'Retry-After': String(rateCheck.resetIn) } }
        );
    }

    try {
        const { messages, context } = await request.json();

        if (!Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'Messages must be a non-empty array' }, { status: 400 });
        }

        const response = await geminiClient.generateChatResponse(messages, context || {});

        return NextResponse.json({ message: response });
    } catch (error) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
    }
}
