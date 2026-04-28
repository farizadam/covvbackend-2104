require('dotenv').config({ path: '../.env' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// The IDs retrieved from your project history
const DRIVER_ACCOUNTS = [
    'acct_1TBzbgQu0wGILUxh', 
    'acct_1TB1jKBzHG6ebFm3', 
    'acct_1T42idR2MceKuUtd'
];

async function auditAllDrivers() {
    console.log(`--- 🌍 GLOBAL STRIPE AUDIT (4/27/2026) ---`);

    for (const accountId of DRIVER_ACCOUNTS) {
        try {
            console.log(`\n🔍 Checking Driver: ${accountId}`);
            
            const payouts = await stripe.payouts.list(
                { limit: 2 }, 
                { stripeAccount: accountId }
            );

            if (payouts.data.length === 0) {
                console.log("   ⚠️ No payout history found.");
            } else {
                payouts.data.forEach(p => {
                    const date = new Date(p.created * 1000).toLocaleDateString();
                    const status = p.status.toUpperCase();
                    console.log(`   [${date}] ID: ${p.id} | ${(p.amount/100).toFixed(2)} ${p.currency.toUpperCase()} | Status: ${status}`);
                });
            }
        } catch (error) {
            console.error(`   ❌ Error fetching account ${accountId}:`, error.message);
        }
    }
    console.log(`\n--- Audit Complete ---`);
}

auditAllDrivers();