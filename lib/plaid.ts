import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const PLAID_ENVIRONMENTS: Record<string, string> = {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
};

let _client: PlaidApi | null = null;

/**
 * Lazy getter for the Plaid API client.
 * Initializes the client only when first accessed, preventing build-time errors
 * when environment variables are not available.
 */
export function getPlaidClient(): PlaidApi {
    if (!_client) {
        const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
        const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
        const PLAID_SECRET = process.env.PLAID_SECRET;

        if (!PLAID_ENVIRONMENTS[PLAID_ENV]) {
            throw new Error(`Invalid PLAID_ENV: "${PLAID_ENV}". Must be sandbox, development, or production.`);
        }

        if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
            throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set');
        }

        const configuration = new Configuration({
            basePath: PLAID_ENVIRONMENTS[PLAID_ENV],
            baseOptions: {
                headers: {
                    'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
                    'PLAID-SECRET': PLAID_SECRET,
                },
            },
        });

        _client = new PlaidApi(configuration);
    }

    return _client;
}

// Legacy export for backward compatibility - will be removed in a future update
export const plaidClient = new Proxy({} as PlaidApi, {
    get(target, prop) {
        console.warn('Using plaidClient directly is deprecated. Use getPlaidClient() instead.');
        return getPlaidClient()[prop as keyof PlaidApi];
    }
});
