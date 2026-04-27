require('dotenv').config({ path: '../.env' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkBankDelivery(driverAccountId) {
    console.log(`--- Checking Bank Delivery for: ${driverAccountId} ---`);

    try {
        // List payouts specifically on the driver's connected account
        const payouts = await stripe.payouts.list(
            { limit: 3 },
            { stripeAccount: driverAccountId }
        );

        if (payouts.data.length === 0) {
            console.log("No bank payouts found for this account.");
            return;
        }

        payouts.data.forEach(p => {
            console.log(`\n🏦 Payout ID: ${p.id}`);
            console.log(`   Amount: ${(p.amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`);
            console.log(`   Status: ${p.status.toUpperCase()}`);
            
            if (p.status === 'paid') {
                console.log(`   ✅ SUCCESS: Funds sent to bank on ${new Date(p.arrival_date * 1000).toLocaleDateString()}.`);
            } else if (p.status === 'in_transit') {
                console.log(`   ⏳ IN PROGRESS: Money is currently moving through the banking system.`);
                console.log(`   📅 Expected Arrival: ${new Date(p.arrival_date * 1000).toLocaleDateString()}`);
            } else if (p.status === 'failed') {
                console.log(`   ❌ FAILED: ${p.failure_message || 'The bank rejected the transfer.'}`);
            }
            
            console.log(`   Bank Account (Last 4): ****${p.bank_account ? p.bank_account.last4 : 'N/A'}`);
            console.log('-----------------------------------------');
        });

    } catch (error) {
        console.error("\n❌ Stripe Error:", error.message);
    }
}

// Check the driver account you've been testing with
checkBankDelivery('acct_1TBzbgQu0wGILUxh');