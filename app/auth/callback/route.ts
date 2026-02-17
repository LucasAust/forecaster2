import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * Auth callback handler.
 * Supabase sends users here after they click the email confirmation link.
 * Handles both PKCE flow (code param) and implicit/token_hash flow.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | null
    const next = searchParams.get('next') ?? '/'
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || origin

    const supabase = await createClient()

    // PKCE flow: exchange authorization code for session
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(`${baseUrl}${next}`)
        }
    }

    // Implicit / token_hash flow: verify the OTP token
    if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type,
        })
        if (!error) {
            return NextResponse.redirect(`${baseUrl}${next}`)
        }
    }

    // If both methods failed or no params provided
    return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Email confirmation failed. Please try signing up again.')}`
    )
}
