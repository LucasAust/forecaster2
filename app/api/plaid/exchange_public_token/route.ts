import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';


import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { public_token } = await request.json();
        const response = await plaidClient.itemPublicTokenExchange({
            public_token: public_token,
        });
        const { access_token, item_id } = response.data;

        // Save to Supabase
        const { error } = await supabase
            .from('plaid_items')
            .upsert({
                user_id: user.id,
                access_token: access_token,
                item_id: item_id
            }, { onConflict: 'user_id, item_id' });

        if (error) {
            console.error('Error saving to Supabase:', error);
            return NextResponse.json({ error: 'Failed to save access token' }, { status: 500 });
        }

        return NextResponse.json({ access_token, item_id });
    } catch (error) {
        console.error('Error exchanging token:', error);
        return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 });
    }
}
