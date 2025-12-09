import { NextResponse } from 'next/server';
import { geminiClient } from '@/lib/gemini';

export async function POST(request: Request) {
    try {
        const { messages, context } = await request.json();

        if (!messages) {
            return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
        }

        const response = await geminiClient.generateChatResponse(messages, context || {});

        return NextResponse.json({ message: response });
    } catch (error) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
    }
}
