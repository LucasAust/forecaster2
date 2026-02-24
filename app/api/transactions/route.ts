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
            .select('access_token, last_synced_at, accounts_data, item_id, sync_cursor')
            .eq('user_id', user.id);

        if (error) {
            console.error("Error fetching plaid items:", error);
            return NextResponse.json({ transactions: [], accounts: [], hasLinkedBank: false });
        }

        if (!items || items.length === 0) {
            // No Plaid items linked — still return any manually-imported transactions from DB
            const { data: manualTx } = await supabase
                .from('transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .limit(2000);
            return NextResponse.json({ transactions: manualTx || [], accounts: [], hasLinkedBank: false });
        }

        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';

        let allTransactions: Record<string, unknown>[] = [];
        let allAccounts: Record<string, unknown>[] = [];

        for (const item of items) {
            try {
                const accessToken = item.access_token;
                const lastSynced = item.last_synced_at ? new Date(item.last_synced_at) : null;
                const now = new Date();
                const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

                // Check cache if not forced
                if (!force && lastSynced && lastSynced > oneHourAgo && item.accounts_data) {
                    continue;
                }

                const response = await (async () => {
                    // Paginate through transactionsSync until has_more is false
                    let cursor = item.sync_cursor || undefined;
                    let allAdded: typeof firstPage.data.added = [];
                    let allModified: typeof firstPage.data.modified = [];
                    let allRemoved: typeof firstPage.data.removed = [];
                    let hasMore = true;

                    const firstPage = await plaidClient.transactionsSync({
                        access_token: accessToken,
                        cursor,
                        count: 500,
                    });
                    allAdded = [...firstPage.data.added];
                    allModified = [...firstPage.data.modified];
                    allRemoved = [...firstPage.data.removed];
                    cursor = firstPage.data.next_cursor;
                    hasMore = firstPage.data.has_more;

                    while (hasMore) {
                        const page = await plaidClient.transactionsSync({
                            access_token: accessToken,
                            cursor,
                            count: 500,
                        });
                        allAdded = [...allAdded, ...page.data.added];
                        allModified = [...allModified, ...page.data.modified];
                        allRemoved = [...allRemoved, ...page.data.removed];
                        cursor = page.data.next_cursor;
                        hasMore = page.data.has_more;
                    }

                    return {
                        added: allAdded,
                        modified: allModified,
                        removed: allRemoved,
                        next_cursor: cursor,
                    };
                })();

                const newTransactions = [
                    ...response.added,
                    ...response.modified
                ];

                // Handle removed transactions
                const removedIds = response.removed.map(r => r.transaction_id);
                if (removedIds.length > 0) {
                    await supabase
                        .from('transactions')
                        .delete()
                        .in('transaction_id', removedIds);
                }

                const accountsResponse = await plaidClient.accountsGet({
                    access_token: accessToken,
                });
                const newAccounts = accountsResponse.data.accounts;

                // Save to Supabase
                if (newTransactions.length > 0) {
                    const transactionsToUpsert = newTransactions.map(t => ({
                        transaction_id: t.transaction_id,
                        user_id: user.id,
                        account_id: t.account_id,
                        amount: t.amount,
                        date: t.date,
                        name: t.name,
                        merchant_name: t.merchant_name || null,
                        category: t.category,
                        pending: t.pending,
                        logo_url: t.logo_url || null
                    }));

                    const { error: upsertError } = await supabase
                        .from('transactions')
                        .upsert(transactionsToUpsert, { onConflict: 'transaction_id' });

                    if (upsertError) {
                        console.error("Error upserting transactions:", upsertError);
                        // Don't advance the cursor — we'll retry these transactions next sync.
                        // Still accumulate in-memory so the forecast can run this request.
                        allTransactions = [...allTransactions, ...transactionsToUpsert];
                        allAccounts = [...allAccounts, ...(newAccounts as unknown as Record<string, unknown>[])];
                        continue;
                    }
                }

                // Update last_synced_at, accounts_data, and sync cursor
                // Only reached when upsert succeeded (or there were no new transactions).
                await supabase
                    .from('plaid_items')
                    .update({
                        last_synced_at: new Date().toISOString(),
                        accounts_data: newAccounts,
                        sync_cursor: response.next_cursor || null,
                    })
                    .eq('item_id', item.item_id);

            } catch (err: unknown) {
                console.error(`Error syncing item ${item.item_id}:`, err);
                const plaidErr = err as { response?: { data?: { error_code?: string } } };
                if (plaidErr.response) {
                    console.error('Plaid Sync Error Details:', JSON.stringify(plaidErr.response.data, null, 2));

                    // Auto-cleanup: if Plaid says the item no longer exists, remove it
                    // so it doesn't keep failing on every future sync.
                    const errorCode = plaidErr.response.data?.error_code;
                    if (errorCode === 'ITEM_NOT_FOUND' || errorCode === 'ITEM_LOGIN_REQUIRED') {
                        console.warn(`Removing stale plaid item ${item.item_id} (${errorCode})`);
                        await supabase
                            .from('plaid_items')
                            .delete()
                            .eq('item_id', item.item_id)
                            .eq('user_id', user.id);
                    } else {
                        // Non-fatal error: still try to populate accounts_data so the UI
                        // doesn't wrongly show "connect a bank" when a bank IS connected.
                        try {
                            const accountsResponse = await plaidClient.accountsGet({ access_token: item.access_token });
                            await supabase
                                .from('plaid_items')
                                .update({ accounts_data: accountsResponse.data.accounts })
                                .eq('item_id', item.item_id);
                        } catch (acctErr) {
                            console.error(`Could not fetch accounts for item ${item.item_id}:`, acctErr);
                        }
                    }
                }
            }
        }

        // Fetch final accounts from DB (includes items we just updated)
        const { data: finalItems, error: itemsError } = await supabase
            .from('plaid_items')
            .select('accounts_data')
            .eq('user_id', user.id);

        if (itemsError) console.error("Error fetching final items:", itemsError);

        // Merge DB accounts with any in-memory accounts (from failed-upsert items)
        const dbAccounts: Record<string, unknown>[] = finalItems?.flatMap(i => i.accounts_data || []) || [];
        const mergedAccounts = [...dbAccounts, ...allAccounts];

        // Deduplicate accounts by account_id
        const acctSeen = new Set<string>();
        const dedupedAccounts = mergedAccounts.filter((acct: Record<string, unknown>) => {
            const id = acct.account_id as string;
            if (!id || acctSeen.has(id)) return false;
            acctSeen.add(id);
            return true;
        });

        const { data: dbTransactions, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(2000);

        if (txError) console.error("Error fetching final transactions:", txError);

        // If DB is empty but we have in-memory transactions (stale cursor scenario),
        // reset all cursors and trigger a one-time full re-sync from Plaid history.
        if ((!dbTransactions || dbTransactions.length === 0) && allTransactions.length === 0 && force && items.length > 0) {
            console.warn('DB has no transactions and in-memory is empty — resetting sync cursors for full re-sync');
            await supabase
                .from('plaid_items')
                .update({ sync_cursor: null })
                .eq('user_id', user.id);
            // Signal to the client to retry; they'll get data on the next request
        }

        // Merge DB rows with in-memory fallback rows (in-memory only present when upsert failed)
        const combinedTx = [...(dbTransactions || []), ...allTransactions];

        // Deduplicate by transaction_id first, then by (date|name|amount) for cross-item dupes
        const txIdSeen = new Set<string>();
        const txKeySeen = new Set<string>();
        const dedupedTx = combinedTx.filter((tx: Record<string, unknown>) => {
            const id = tx.transaction_id as string;
            if (id) {
                if (txIdSeen.has(id)) return false;
                txIdSeen.add(id);
            }
            const key = `${tx.date}|${tx.name}|${Math.round((tx.amount as number) * 100)}`;
            if (txKeySeen.has(key)) return false;
            txKeySeen.add(key);
            return true;
        });

        allAccounts = dedupedAccounts;
        allTransactions = dedupedTx;

        return NextResponse.json({ transactions: allTransactions, accounts: allAccounts, hasLinkedBank: items.length > 0 });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }}
