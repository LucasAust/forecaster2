import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function DELETE() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Validate service role key exists BEFORE deleting any data.
        // Without it, we can't delete the auth user — leaving an orphaned account.
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            console.error("SUPABASE_SERVICE_ROLE_KEY is not configured — cannot delete account");
            return NextResponse.json({ error: "Account deletion is temporarily unavailable" }, { status: 503 });
        }

        // Delete the auth user first — if this fails, we bail before touching data.
        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
        if (deleteError) {
            console.error("Error deleting auth user:", deleteError);
            return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
        }

        // Auth user deleted — now clean up data tables (best-effort, RLS will
        // block access anyway since the auth user no longer exists).
        await supabase.from("mfa_email_codes").delete().eq("user_id", user.id);
        await supabase.from("insight_answers").delete().eq("user_id", user.id);
        await supabase.from("ai_suggestions").delete().eq("user_id", user.id);
        await supabase.from("transactions").delete().eq("user_id", user.id);
        await supabase.from("plaid_items").delete().eq("user_id", user.id);
        await supabase.from("forecasts").delete().eq("user_id", user.id);
        await supabase.from("user_settings").delete().eq("user_id", user.id);

        // Sign user out
        await supabase.auth.signOut();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting account:", error);
        return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }
}
