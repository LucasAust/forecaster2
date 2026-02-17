import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_ENVIRONMENTS: Record<string, string> = {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
};

if (!PLAID_ENVIRONMENTS[PLAID_ENV]) {
    throw new Error(`Invalid PLAID_ENV: "${PLAID_ENV}". Must be sandbox, development, or production.`);
}

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;

if (process.env.NODE_ENV === 'production' && (!PLAID_CLIENT_ID || !PLAID_SECRET)) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set in production');
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

export const plaidClient = new PlaidApi(configuration);
