/**
 * Email sending utility.
 * Uses Resend API via fetch (no extra npm dependency).
 * Set RESEND_API_KEY and EMAIL_FROM in environment variables.
 *
 * If no RESEND_API_KEY is set, falls back to console logging (dev mode).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Arc Finance <noreply@arcfinance.app>";

interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
    if (!RESEND_API_KEY) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("RESEND_API_KEY is required in production. Email cannot be sent.");
        }
        // Dev fallback: log to console (never log the actual code in prod)
        console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject}`);
        console.log(`[EMAIL DEV] Body preview: ${(text || html).slice(0, 200)}`);
        return;
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: EMAIL_FROM,
            to: [to],
            subject,
            html,
            text,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Email send failed: ${res.status} ${body}`);
    }
}

/**
 * Generate a cryptographically secure 6-digit OTP code.
 */
export function generateOTPCode(): string {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return String(array[0] % 1000000).padStart(6, "0");
}

/**
 * Send an MFA verification email with a 6-digit code.
 */
export async function sendMFACode(email: string, code: string): Promise<void> {
    await sendEmail({
        to: email,
        subject: "Your verification code",
        text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, please ignore this email.`,
        html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #2563eb, #7c3aed); width: 48px; height: 48px; border-radius: 12px; line-height: 48px; text-align: center;">
                        <span style="color: white; font-size: 24px;">🛡️</span>
                    </div>
                </div>
                <h2 style="color: #fff; text-align: center; margin-bottom: 8px; font-size: 20px;">
                    Verification Code
                </h2>
                <p style="color: #9ca3af; text-align: center; margin-bottom: 24px; font-size: 14px;">
                    Enter this code to verify your identity
                </p>
                <div style="background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px;">
                    <span style="font-family: monospace; font-size: 36px; letter-spacing: 0.5em; color: #fff; font-weight: bold;">
                        ${code}
                    </span>
                </div>
                <p style="color: #6b7280; text-align: center; font-size: 12px;">
                    This code expires in 10 minutes.<br/>
                    If you didn't request this, please ignore this email.
                </p>
            </div>
        `,
    });
}
