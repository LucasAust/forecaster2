import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { plaidClient } from "@/lib/plaid";

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { item_id } = await request.json();
        if (!item_id) {
            return NextResponse.json({ error: "item_id is required" }, { status: 400 });
        }

        // Get the access token for this item
        const { data: item, error: fetchError } = await supabase
            .from("plaid_items")
            .select("access_token")
            .eq("user_id", user.id)
            .eq("item_id", item_id)
            .single();

        if (fetchError || !item) {
            return NextResponse.json({ error: "Item not found" }, { status: 404 });
        }

        // Remove from Plaid
        try {
            await plaidClient.itemRemove({ access_token: item.access_token });
        } catch {
            // Even if Plaid removal fails, still remove from our DB
            console.warn("Plaid itemRemove failed, proceeding with DB removal");
        }

        // Remove from database
        const { error: deleteError } = await supabase
            .from("plaid_items")
            .delete()
            .eq("user_id", user.id)
            .eq("item_id", item_id);

        if (deleteError) throw deleteError;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error disconnecting account:", error);
        return NextResponse.json({ error: "Failed to disconnect account" }, { status: 500 });
    }
}
