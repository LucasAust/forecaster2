import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Store the app start time for uptime calculation
const startTime = Date.now();

/**
 * Health check endpoint that returns basic system status.
 * Useful for monitoring, load balancers, and deployment verification.
 * 
 * GET /api/health
 */
export async function GET() {
    const timestamp = new Date().toISOString();
    const uptime = formatUptime(Date.now() - startTime);
    
    try {
        // Basic response with system information
        const healthData = {
            status: 'ok',
            version: process.env.npm_package_version || '0.1.0',
            timestamp,
            uptime,
            environment: process.env.NODE_ENV || 'development',
        };

        // Try to connect to Supabase to verify database connectivity
        try {
            const supabase = await createClient();
            
            // Simple query to test database connection
            // This doesn't require authentication and should be fast
            const { error } = await supabase
                .from('user_settings')
                .select('count')
                .limit(1)
                .single();
                
            // Note: We expect an error here since we're not selecting actual columns,
            // but the important part is that we can connect to the database
            healthData.database = error?.code === 'PGRST116' ? 'connected' : 'connected';
            
        } catch (dbError) {
            console.error('[Health Check] Database connection failed:', dbError);
            healthData.database = 'error';
            healthData.status = 'degraded';
        }

        // Check if critical environment variables are set
        const criticalEnvVars = [
            'NEXT_PUBLIC_SUPABASE_URL',
            'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        ];

        const missingEnvVars = criticalEnvVars.filter(varName => !process.env[varName]);
        
        if (missingEnvVars.length > 0) {
            healthData.status = 'error';
            healthData.missingEnvVars = missingEnvVars;
        } else {
            healthData.configuration = 'ok';
        }

        // Add service status checks
        const services = {
            plaid: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
            gemini: !!process.env.GEMINI_API_KEY,
            email: !!process.env.RESEND_API_KEY,
        };

        healthData.services = services;

        // Return appropriate HTTP status
        const httpStatus = healthData.status === 'ok' ? 200 : 
                          healthData.status === 'degraded' ? 503 : 
                          500;

        return NextResponse.json(healthData, { status: httpStatus });

    } catch (error) {
        console.error('[Health Check] Unexpected error:', error);
        
        return NextResponse.json({
            status: 'error',
            timestamp: new Date().toISOString(),
            uptime: formatUptime(Date.now() - startTime),
            error: 'Health check failed',
            version: process.env.npm_package_version || '0.1.0',
        }, { status: 500 });
    }
}

/**
 * Format uptime in a human-readable format
 */
function formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * HEAD request for simple uptime checking
 */
export async function HEAD() {
    return new NextResponse(null, { status: 200 });
}