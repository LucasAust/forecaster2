import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Retrieve all access tokens for the user
        const { data: items, error } = await supabase
            .from('plaid_items')
            .select('access_token, last_synced_at, accounts_data, item_id')
            .eq('user_id', user.id);

        if (error) {
            console.error("Error fetching plaid items:", error);
            return NextResponse.json({ transactions: [], accounts: [] });
        }

        if (!items || items.length === 0) {
            console.log("No plaid items found for user");
            return NextResponse.json({ transactions: [], accounts: [] });
        }

        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';

        let allTransactions: any[] = [];
        let allAccounts: any[] = [];

        for (const item of items) {
            try {
                const accessToken = item.access_token;
                const lastSynced = item.last_synced_at ? new Date(item.last_synced_at) : null;
                const now = new Date();
                const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

                // Check cache if not forced
                if (!force && lastSynced && lastSynced > oneHourAgo && item.accounts_data) {
                    console.log(`Serving transactions from cache for item ${item.item_id}`);
                    continue;
                }

                console.log(`Fetching transactions via transactionsSync for item ${item.item_id}...`);

                const response = await plaidClient.transactionsSync({
                    access_token: accessToken,
                    count: 500,
                });

                const newTransactions = [
                    ...response.data.added,
                    ...response.data.modified
                ];

                const accountsResponse = await plaidClient.accountsGet({
                    access_token: accessToken,
                });
                const newAccounts = accountsResponse.data.accounts;

                console.log(`Plaid Sync response for item ${item.item_id}: ${newTransactions.length} txns, ${newAccounts.length} accts`);

                // Save to Supabase
                if (newTransactions.length > 0) {
                    const transactionsToUpsert = newTransactions.map(t => ({
                        transaction_id: t.transaction_id,
                        user_id: user.id,
                        account_id: t.account_id,
                        amount: t.amount,
                        date: t.date,
                        name: t.name,
                        category: t.category,
                        pending: t.pending,
                        logo_url: t.logo_url || null
                    }));

                    const { error: upsertError } = await supabase
                        .from('transactions')
                        .upsert(transactionsToUpsert, { onConflict: 'transaction_id' });

                    if (upsertError) {
                        console.error("Error upserting transactions:", upsertError);
                    }
                }

                // Update last_synced_at and accounts_data
                await supabase
                    .from('plaid_items')
                    .update({
                        last_synced_at: new Date().toISOString(),
                        accounts_data: newAccounts
                    })
                    .eq('item_id', item.item_id);

            } catch (err: any) {
                console.error(`Error syncing item ${item.item_id}:`, err);
                if (err.response) {
                    console.error('Plaid Sync Error Details:', JSON.stringify(err.response.data, null, 2));
                }
            }
        }

        console.log("Finished syncing all items. Fetching from DB...");

        // Finally, fetch ALL up-to-date transactions and accounts from DB/Supabase to return unified view
        const { data: finalItems, error: itemsError } = await supabase
            .from('plaid_items')
            .select('accounts_data')
            .eq('user_id', user.id);

        if (itemsError) console.error("Error fetching final items:", itemsError);

        allAccounts = finalItems?.flatMap(i => i.accounts_data || []) || [];

        const { data: finalTransactions, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });

        if (txError) console.error("Error fetching final transactions:", txError);

        console.log(`Returning ${finalTransactions?.length} transactions and ${allAccounts.length} accounts.`);

        allTransactions = finalTransactions || [];

        return NextResponse.json({ transactions: allTransactions, accounts: allAccounts });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }
}
