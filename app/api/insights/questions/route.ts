import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { generateInsightQuestions } from "@/lib/insight-questions";
import type { Transaction } from "@/types";
import type { InsightAnswer } from "@/lib/insight-questions";

/**
 * GET /api/insights/questions
 * Analyzes the user's transactions and returns up to 5 data-driven
 * insight questions to improve forecast accuracy.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        // Fetch user's transactions
        const { data: transactions } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id)
            .order("date", { ascending: true });

        // Fetch existing answers
        const { data: existingAnswers } = await supabase
            .from("insight_answers")
            .select("question_id, value, answered_at")
            .eq("user_id", user.id);

        const questions = generateInsightQuestions(
            (transactions || []) as Transaction[],
            (existingAnswers || []) as InsightAnswer[]
        );

        return NextResponse.json({ questions });
    } catch (error) {
        console.error("Error generating insight questions:", error);
        return NextResponse.json({ questions: [] });
    }
}
