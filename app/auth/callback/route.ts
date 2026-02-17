import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * Auth callback handler.
 * Supabase sends users here after they click the email confirmation link.
 * We exchange the auth code for a session, then redirect into the app
 * (middleware will enforce MFA enrollment if not yet configured).
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            // Use the configured base URL for production,
            // fall back to the request origin for local dev
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || origin
            return NextResponse.redirect(`${baseUrl}${next}`)
        }
    }

    // If code is missing or exchange failed, send them to login with an error
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Email confirmation failed. Please try again.')}`
    )
}
