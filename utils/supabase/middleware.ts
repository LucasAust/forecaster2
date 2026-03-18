import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

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
                // Check email MFA cookie — must validate signature & expiry, not just existence
                const mfaCookie = request.cookies.get('arc_email_mfa')
                if (!mfaCookie?.value || !isEmailMfaCookieValid(mfaCookie.value, user.id)) {
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

// ─── Email MFA cookie validation (mirrors lib/mfa-session.ts logic) ──────
// We duplicate validation here because middleware runs in the Edge runtime
// and cannot import the full mfa-session module (which uses next/headers cookies()).

const MFA_MAX_AGE = 12 * 60 * 60; // 12 hours in seconds

function getMfaSecret(): string {
    const secret = process.env.MFA_COOKIE_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            // In production without a secret, reject all cookies
            return '';
        }
        return 'dev-only-mfa-secret-not-for-production';
    }
    return secret;
}

function isEmailMfaCookieValid(cookieValue: string, userId: string): boolean {
    const secret = getMfaSecret();
    if (!secret) return false;

    const parts = cookieValue.split(':');
    if (parts.length !== 3) return false;

    const [cookieUserId, timestamp, providedSignature] = parts;
    if (cookieUserId !== userId) return false;

    // Validate signature
    const payload = `${cookieUserId}:${timestamp}`;
    const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(providedSignature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    // Check expiry
    const age = Date.now() - Number(timestamp);
    if (age > MFA_MAX_AGE * 1000) return false;

    return true;
}
