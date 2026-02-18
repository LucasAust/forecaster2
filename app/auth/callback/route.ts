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
    const rawNext = searchParams.get('next') ?? '/'
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || origin

    // Prevent open redirect — only allow relative paths
    const next = (rawNext.startsWith('/') && !rawNext.startsWith('//')) ? rawNext : '/'

    const supabase = await createClient()

    // PKCE flow: exchange authorization code for session
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(`${baseUrl}${next}`)
        }
        console.error('PKCE exchange failed:', error.message)
        // If PKCE fails (e.g. code verifier cookie missing), show the error
        return NextResponse.redirect(
            `${baseUrl}/login?error=${encodeURIComponent(error.message)}`
        )
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
        console.error('Token hash verification failed:', error.message)
        return NextResponse.redirect(
            `${baseUrl}/login?error=${encodeURIComponent(error.message)}`
        )
    }

    // No recognized params at all — show what we received for debugging
    console.error('Auth callback received no valid params. Query:', Object.fromEntries(searchParams.entries()))
    return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Email confirmation failed. The link may have expired — please try signing up again.')}`
    )
}
