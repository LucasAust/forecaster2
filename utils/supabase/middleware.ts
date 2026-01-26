import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    console.log("Middleware checking env vars:");
    console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "Defined" : "Missing");
    console.log("Key:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Defined" : "Missing");

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

        // If AAL2, we are good.
        if (mfaData && mfaData.currentLevel === 'aal2') {
            return supabaseResponse
        }

        // Check for verified factors
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const hasVerifiedFactor = factors?.all?.some(f => f.status === 'verified')

        if (!hasVerifiedFactor) {
            // No verified factors -> Force Enrollment
            if (!request.nextUrl.pathname.startsWith('/auth/mfa/enroll')) {
                const url = request.nextUrl.clone()
                url.pathname = '/auth/mfa/enroll'
                return NextResponse.redirect(url)
            }
        } else {
            // Has factors, but not AAL2 -> Force verification
            if (mfaData && mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
                if (!request.nextUrl.pathname.startsWith('/auth/mfa/challenge')) {
                    const url = request.nextUrl.clone()
                    url.pathname = '/auth/mfa/challenge'
                    return NextResponse.redirect(url)
                }
            }
        }
    }

    return supabaseResponse
}
