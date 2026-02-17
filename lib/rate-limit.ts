/**
 * Simple in-memory rate limiter for API routes.
 * Tracks request counts per identifier (e.g., user ID) within a sliding window.
 * Note: In a multi-instance deployment, replace with Redis-backed limiter.
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store) {
            if (now > entry.resetTime) {
                store.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}

interface RateLimitConfig {
    /** Maximum number of requests in the window */
    maxRequests: number;
    /** Window duration in seconds */
    windowSeconds: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number; // seconds until reset
}

export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): RateLimitResult {
    const now = Date.now();
    const key = identifier;
    const entry = store.get(key);

    if (!entry || now > entry.resetTime) {
        // New window
        store.set(key, {
            count: 1,
            resetTime: now + config.windowSeconds * 1000,
        });
        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetIn: config.windowSeconds,
        };
    }

    if (entry.count >= config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: Math.ceil((entry.resetTime - now) / 1000),
        };
    }

    entry.count++;
    return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetIn: Math.ceil((entry.resetTime - now) / 1000),
    };
}

/** Pre-configured rate limits for different endpoint types */
export const RATE_LIMITS = {
    /** AI chat: 20 requests per minute */
    chat: { maxRequests: 20, windowSeconds: 60 },
    /** Forecast generation: 5 requests per 10 minutes */
    forecast: { maxRequests: 5, windowSeconds: 600 },
    /** Suggestions generation: 5 requests per 10 minutes */
    suggestions: { maxRequests: 5, windowSeconds: 600 },
} as const;
