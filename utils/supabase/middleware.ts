import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

const MFA_COOKIE_NAME = 'arc_email_mfa'
const MFA_MAX_AGE = 12 * 60 * 60 * 1000 // 12 hours in ms

function getMfaSecret(): string {
    const secret = process.env.MFA_COOKIE_SECRET
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('MFA_COOKIE_SECRET must be set in production')
        }
        return 'dev-only-mfa-secret-not-for-production'
    }
    return secret
}

function verifyEmailMfaCookie(cookieValue: string | undefined, userId: string): boolean {
    if (!cookieValue) return false
    const parts = cookieValue.split(':')
    if (parts.length !== 3) return false
    const [cookieUserId, timestamp, signature] = parts
    if (cookieUserId !== userId) return false
    const payload = `${cookieUserId}:${timestamp}`
    const expected = createHmac('sha256', getMfaSecret()).update(payload).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
    if (Date.now() - Number(timestamp) > MFA_MAX_AGE) return false
    return true
}

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

    if (user && !request.nextUrl.pathname.startsWith('/auth') && !request.nextUrl.pathname.startsWith('/login')) {
        const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

        // If AAL2 (TOTP verified), we are good
        if (mfaData && mfaData.currentLevel === 'aal2') {
            return supabaseResponse
        }

        // Check for verified TOTP factors
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const hasVerifiedTotpFactor = factors?.all?.some(
            f => f.factor_type === 'totp' && f.status === 'verified'
        )

        if (hasVerifiedTotpFactor) {
            // Has verified TOTP factors but NOT at AAL2 → always force challenge
            if (!request.nextUrl.pathname.startsWith('/auth/mfa/challenge')) {
                if (request.nextUrl.pathname.startsWith('/api')) {
                    return NextResponse.json({ error: 'MFA verification required' }, { status: 403 })
                }
                const url = request.nextUrl.clone()
                url.pathname = '/auth/mfa/challenge'
                return NextResponse.redirect(url)
            }
            return supabaseResponse
        }

        // No TOTP factors — check for email MFA
        const { data: settings } = await supabase
            .from('user_settings')
            .select('mfa_method')
            .eq('user_id', user.id)
            .single()

        if (settings?.mfa_method === 'email') {
            // Check email MFA cookie
            const emailMfaCookie = request.cookies.get(MFA_COOKIE_NAME)?.value
            if (verifyEmailMfaCookie(emailMfaCookie, user.id)) {
                return supabaseResponse
            }
            // Not verified — redirect to email challenge
            if (!request.nextUrl.pathname.startsWith('/auth/mfa/challenge')) {
                if (request.nextUrl.pathname.startsWith('/api')) {
                    return NextResponse.json({ error: 'MFA verification required' }, { status: 403 })
                }
                const url = request.nextUrl.clone()
                url.pathname = '/auth/mfa/challenge'
                return NextResponse.redirect(url)
            }
            return supabaseResponse
        }

        // No MFA configured at all -> Force Enrollment
        if (!request.nextUrl.pathname.startsWith('/auth/mfa/enroll')) {
            if (request.nextUrl.pathname.startsWith('/api')) {
                return NextResponse.json({ error: 'MFA enrollment required' }, { status: 403 })
            }
            const url = request.nextUrl.clone()
            url.pathname = '/auth/mfa/enroll'
            return NextResponse.redirect(url)
        }
    }

    return supabaseResponse
}
