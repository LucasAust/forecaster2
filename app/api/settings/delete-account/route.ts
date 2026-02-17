import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function DELETE() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Delete user data from all tables
        await supabase.from("mfa_email_codes").delete().eq("user_id", user.id);
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
