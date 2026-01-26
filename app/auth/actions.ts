'use server'

import { createClient } from '@/utils/supabase/server'
import QRCode from 'qrcode'

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
}
