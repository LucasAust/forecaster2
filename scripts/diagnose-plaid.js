const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fs = require('fs');
const path = require('path');

// Manually load .env since we're outside Next.js
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        env[key] = val;
    }
});

const PLAID_ENV = env.PLAID_ENV || 'sandbox';
const PLAID_CLIENT_ID = env.PLAID_CLIENT_ID;
const PLAID_SECRET = env.PLAID_SECRET;

console.log('Testing Plaid Connection...');
console.log('Environment:', PLAID_ENV);
console.log('Client ID:', PLAID_CLIENT_ID ? 'Set' : 'Missing');
console.log('Secret:', PLAID_SECRET ? 'Set' : 'Missing');

console.log('Available Environments:', Object.keys(PlaidEnvironments));
console.log(`Parsed PLAID_ENV: "${PLAID_ENV}"`);

if (!PlaidEnvironments[PLAID_ENV]) {
    console.error(`Invalid PLAID_ENV: "${PLAID_ENV}". Must be one of: ${Object.keys(PlaidEnvironments).join(', ')}`);
    process.exit(1);
}

const configuration = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
            'PLAID-SECRET': PLAID_SECRET,
        },
    },
});

const client = new PlaidApi(configuration);

async function test() {
    try {
        console.log('Attempting to create link token...');
        const response = await client.linkTokenCreate({
            user: { client_user_id: 'test-user-id' },
            client_name: 'Arc Financial Test',
            products: ['transactions'],
            country_codes: ['US'],
            language: 'en',
        });
        console.log('Success! Link Token created:', response.data.link_token);
    } catch (error) {
        console.error('FAILED!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

test();
