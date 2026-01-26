import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_ENVIRONMENTS: Record<string, string> = {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
};

const configuration = new Configuration({
    basePath: PLAID_ENVIRONMENTS[PLAID_ENV],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});

export const plaidClient = new PlaidApi(configuration);
