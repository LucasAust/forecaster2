import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                    })
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (
        !user &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/signup')
    ) {
        if (request.nextUrl.pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // MFA enforcement: if user is logged in and has MFA configured, ensure they've
    // completed the challenge before accessing protected routes.
    if (
        user &&
        !request.nextUrl.pathname.startsWith('/auth/mfa') &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/api/auth')
    ) {
        try {
            // Check if user has MFA configured
            const { data: settings } = await supabase
                .from('user_settings')
                .select('mfa_method')
                .eq('user_id', user.id)
                .maybeSingle()

            const mfaMethod = settings?.mfa_method

            if (mfaMethod === 'totp') {
                // Check Supabase AAL level — if AAL1 but TOTP is required, redirect to challenge
                const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
                if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
                    const url = request.nextUrl.clone()
                    url.pathname = '/auth/mfa/challenge'
                    return NextResponse.redirect(url)
                }
            } else if (mfaMethod === 'email') {
                // Check email MFA cookie
                const mfaCookie = request.cookies.get('arc_email_mfa')
                if (!mfaCookie?.value) {
                    const url = request.nextUrl.clone()
                    url.pathname = '/auth/mfa/challenge'
                    return NextResponse.redirect(url)
                }
            }
        } catch {
            // If the MFA check fails, allow access rather than blocking
        }
    }

    return supabaseResponse
}
