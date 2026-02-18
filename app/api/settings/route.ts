import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const payload = await request.json();
        const { monthly_budget, display_name } = payload;

        let updateData: Record<string, string | number> = { user_id: user.id };

        if (monthly_budget !== undefined && monthly_budget !== null) {
            if (isNaN(Number(monthly_budget))) {
                return NextResponse.json({ error: 'Invalid budget value' }, { status: 400 });
            }
            updateData.monthly_budget = Number(monthly_budget);
        }

        if (display_name !== undefined) {
            if (typeof display_name !== 'string' || display_name.length > 100) {
                return NextResponse.json({ error: 'Display name must be a string under 100 characters' }, { status: 400 });
            }
            updateData.display_name = display_name.trim();
        }

        if (Object.keys(updateData).length <= 1) { // Only user_id
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const { error } = await supabase
            .from('user_settings')
            .upsert(updateData, { onConflict: 'user_id' });

        if (error) throw error;

        return NextResponse.json({ success: true, ...updateData });
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data, error } = await supabase
            .from('user_settings')
            .select('monthly_budget, display_name')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        return NextResponse.json({
            monthly_budget: data?.monthly_budget || 0,
            display_name: data?.display_name || null,
            email: user.email
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}
