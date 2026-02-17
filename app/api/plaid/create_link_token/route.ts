import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { Products, CountryCode } from 'plaid';

import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const response = await plaidClient.linkTokenCreate({
            user: { client_user_id: user.id },
            client_name: 'Arc Financial',
            products: [Products.Transactions],
            country_codes: [CountryCode.Us],
            language: 'en',
        });
        return NextResponse.json(response.data);
    } catch (error: unknown) {
        console.error('Error creating link token:', error);
        const err = error as { response?: { data?: unknown } };
        if (err.response) {
            console.error('Plaid error details:', JSON.stringify(err.response.data, null, 2));
        }
        return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 });
    }
}
