import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { InsightAnswer } from "@/lib/insight-questions";

/**
 * POST /api/insights/answers
 * Save user's answers to insight questions. Upserts by question_id.
 */
export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json() as { answers: InsightAnswer[] };
        const answers = body.answers;

        if (!Array.isArray(answers) || answers.length === 0) {
            return NextResponse.json({ success: true });
        }

        // Upsert each answer (max 10), skipping invalid entries
        const limited = answers.slice(0, 10);
        for (const answer of limited) {
            if (!answer.question_id || typeof answer.question_id !== 'string') continue;
            if (answer.value === undefined || answer.value === null) continue;
            await supabase
                .from("insight_answers")
                .upsert({
                    user_id: user.id,
                    question_id: answer.question_id,
                    value: answer.value,
                    answered_at: answer.answered_at || new Date().toISOString(),
                }, { onConflict: "user_id,question_id" });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving insight answers:", error);
        return NextResponse.json({ error: "Failed to save answers" }, { status: 500 });
    }
}

/**
 * GET /api/insights/answers
 * Fetch all saved insight answers for the current user.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: answers } = await supabase
        .from("insight_answers")
        .select("question_id, value, answered_at")
        .eq("user_id", user.id);

    return NextResponse.json({ answers: answers || [] });
}
