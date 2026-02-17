/**
 * MFA session management for email-based MFA.
 *
 * Since email MFA is not managed by Supabase's AAL system,
 * we track verification state via a signed, HttpOnly cookie.
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "arc_email_mfa";

function getSecret(): string {
    const secret = process.env.MFA_COOKIE_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("MFA_COOKIE_SECRET must be set in production");
        }
        return "dev-only-mfa-secret-not-for-production";
    }
    return secret;
}

const MAX_AGE = 12 * 60 * 60; // 12 hours

function sign(value: string): string {
    return createHmac("sha256", getSecret()).update(value).digest("hex");
}

/**
 * Set the email MFA verified cookie after successful code verification.
 */
export async function setEmailMfaVerified(userId: string): Promise<void> {
    const timestamp = Date.now().toString();
    const payload = `${userId}:${timestamp}`;
    const signature = sign(payload);
    const cookieValue = `${payload}:${signature}`;

    const jar = await cookies();
    jar.set(COOKIE_NAME, cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: MAX_AGE,
        path: "/",
    });
}

/**
 * Check if the email MFA cookie is valid for the given user.
 */
export async function isEmailMfaVerified(userId: string): Promise<boolean> {
    const jar = await cookies();
    const cookie = jar.get(COOKIE_NAME);
    if (!cookie?.value) return false;

    const parts = cookie.value.split(":");
    if (parts.length !== 3) return false;

    const [cookieUserId, timestamp, providedSignature] = parts;
    if (cookieUserId !== userId) return false;

    // Check signature (timing-safe comparison)
    const payload = `${cookieUserId}:${timestamp}`;
    const expectedSignature = sign(payload);
    const a = Buffer.from(providedSignature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    // Check expiry
    const age = Date.now() - Number(timestamp);
    if (age > MAX_AGE * 1000) return false;

    return true;
}

/**
 * Clear the email MFA cookie (on logout or unenroll).
 */
export async function clearEmailMfaCookie(): Promise<void> {
    const jar = await cookies();
    jar.delete(COOKIE_NAME);
}
