import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { data, error } = await supabase
            .from("plaid_items")
            .select("id, item_id, created_at, accounts_data")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ items: data || [] });
    } catch (error) {
        console.error("Error fetching accounts:", error);
        return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }
}
