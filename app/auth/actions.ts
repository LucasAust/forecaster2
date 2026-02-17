'use server'

import { createClient } from '@/utils/supabase/server'
import QRCode from 'qrcode'
import { generateOTPCode, sendMFACode } from '@/lib/email'
import { setEmailMfaVerified, clearEmailMfaCookie } from '@/lib/mfa-session'
import { checkRateLimit } from '@/lib/rate-limit'

// ─── TOTP MFA ────────────────────────────────────────────────

export async function enrollMFA() {
    const supabase = await createClient()

    // 1. Cleanup any existing unverified factors to prevent duplicates
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const unverifiedFactors = factors?.all?.filter(f => f.factor_type === 'totp' && f.status === 'unverified') || []

    for (const factor of unverifiedFactors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }

    // 2. Proceed with new enrollment
    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
    })

    if (error) {
        throw new Error(error.message)
    }

    const qrCode = await QRCode.toDataURL(data.totp.uri)

    // Do NOT set mfa_method yet — that happens after TOTP code is verified.

    return {
        id: data.id,
        secret: data.totp.secret,
        qrCode,
    }
}

export async function verifyEnrollment(factorId: string, code: string) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
    })

    if (error) {
        throw new Error(error.message)
    }

    // Commit: mark MFA method as TOTP in user_settings after successful verification
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        await supabase.from('user_settings').upsert(
            { user_id: user.id, mfa_method: 'totp' },
            { onConflict: 'user_id' }
        )
    }

    return data
}

export async function unenrollMFA(factorId: string) {
    const supabase = await createClient()
    const { error } = await supabase.auth.mfa.unenroll({
        factorId,
    })

    if (error) {
        throw new Error(error.message)
    }

    // Clear MFA method
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        await supabase.from('user_settings').upsert(
            { user_id: user.id, mfa_method: null },
            { onConflict: 'user_id' }
        )
    }
}

// ─── Email MFA ───────────────────────────────────────────────

export async function enrollEmailMFA() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
        throw new Error('No email address associated with this account')
    }

    // Invalidate any existing unused codes for this user
    await supabase
        .from('mfa_email_codes')
        .update({ used: true })
        .eq('user_id', user.id)
        .eq('used', false)

    // Generate and store the verification code
    const code = generateOTPCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: insertError } = await supabase.from('mfa_email_codes').insert({
        user_id: user.id,
        code,
        expires_at: expiresAt,
    })

    if (insertError) {
        throw new Error('Failed to generate verification code. Please try again.')
    }

    // Send the code — only after it's stored successfully
    try {
        await sendMFACode(user.email, code)
    } catch (e) {
        // Clean up the stored code since sending failed
        await supabase
            .from('mfa_email_codes')
            .update({ used: true })
            .eq('user_id', user.id)
            .eq('code', code)
        throw new Error('Failed to send verification email. Please try again.')
    }

    // Do NOT set mfa_method yet — that happens after the code is verified.
    // Do NOT unenroll TOTP factors yet — that also happens after verification.

    return { email: maskEmail(user.email) }
}

export async function sendEmailMFAChallenge() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
        throw new Error('No email address found')
    }

    // Rate limit: max 3 emails per 5 minutes
    const rateCheck = checkRateLimit(`mfa-email:${user.id}`, { maxRequests: 3, windowSeconds: 300 })
    if (!rateCheck.allowed) {
        throw new Error(`Too many code requests. Try again in ${rateCheck.resetIn}s.`)
    }

    // Invalidate any existing unused codes
    await supabase
        .from('mfa_email_codes')
        .update({ used: true })
        .eq('user_id', user.id)
        .eq('used', false)

    const code = generateOTPCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await supabase.from('mfa_email_codes').insert({
        user_id: user.id,
        code,
        expires_at: expiresAt,
    })

    await sendMFACode(user.email, code)

    return { email: maskEmail(user.email) }
}

export async function verifyEmailMFACode(code: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Not authenticated')
    }

    // Brute-force protection: max 5 attempts per 5 minutes
    const rateCheck = checkRateLimit(`mfa-verify:${user.id}`, { maxRequests: 5, windowSeconds: 300 })
    if (!rateCheck.allowed) {
        throw new Error(`Too many verification attempts. Try again in ${rateCheck.resetIn}s.`)
    }

    // Find valid code
    const { data: codeRow } = await supabase
        .from('mfa_email_codes')
        .select('*')
        .eq('user_id', user.id)
        .eq('code', code)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (!codeRow) {
        throw new Error('Invalid or expired code')
    }

    // Mark code as used
    await supabase
        .from('mfa_email_codes')
        .update({ used: true })
        .eq('id', codeRow.id)

    // Commit the email MFA enrollment: set mfa_method in user_settings
    await supabase.from('user_settings').upsert(
        { user_id: user.id, mfa_method: 'email' },
        { onConflict: 'user_id' }
    )

    // Unenroll any existing TOTP factors (switching from TOTP to email)
    const { data: factors } = await supabase.auth.mfa.listFactors()
    for (const factor of factors?.all || []) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }

    // Set the email MFA verified cookie
    await setEmailMfaVerified(user.id)

    return { success: true }
}

export async function unenrollEmailMFA() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Not authenticated')
    }

    // Clear MFA method
    await supabase.from('user_settings').upsert(
        { user_id: user.id, mfa_method: null },
        { onConflict: 'user_id' }
    )

    // Clean up any pending codes
    await supabase
        .from('mfa_email_codes')
        .delete()
        .eq('user_id', user.id)

    await clearEmailMfaCookie()
}

export async function getMfaMethod(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
        .from('user_settings')
        .select('mfa_method')
        .eq('user_id', user.id)
        .single()

    return data?.mfa_method || null
}

// ─── Helpers ─────────────────────────────────────────────────

function maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (local.length <= 2) return `${local[0]}***@${domain}`
    return `${local[0]}${local[1]}***@${domain}`
}
