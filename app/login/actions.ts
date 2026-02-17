'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        redirect('/login?error=' + encodeURIComponent(error.message))
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

export async function signup(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${siteUrl}/auth/callback`,
        },
    })

    if (error) {
        // If user already exists, give a more helpful message
        if (error.message.toLowerCase().includes('already') ||
            error.message.toLowerCase().includes('registered')) {
            redirect('/login?error=' + encodeURIComponent(
                'An account with this email already exists. Try signing in instead, or check your email for a confirmation link from a previous signup.'
            ))
        }
        redirect('/login?error=' + encodeURIComponent(error.message))
    }

    // Supabase v2 security: if email confirmation is on and user already exists,
    // signUp may succeed but return an empty identities array (no error thrown).
    // Detect this to avoid confusion.
    if (data?.user?.identities?.length === 0) {
        redirect('/login?error=' + encodeURIComponent(
            'An account with this email already exists. Try signing in instead.'
        ))
    }

    // If email confirmation is enabled, the user needs to confirm before proceeding.
    if (data?.user && !data.user.confirmed_at && !data.session) {
        redirect('/login?message=' + encodeURIComponent(
            'Check your email for a confirmation link to complete signup.'
        ))
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

export async function signout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login')
}
