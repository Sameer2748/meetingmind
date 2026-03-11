const dbService = require('./src/services/dbService');
require('dotenv').config();

async function resetPlan() {
    const email = 'mrao27488@gmail.com';
    console.log(`[Reset] Setting plan to 'starter' for ${email}...`);

    const success = await dbService.upgradeUserPlan(email, 'starter');

    if (success) {
        console.log('[Reset] ✅ Plan reset successfully');
    } else {
        console.log('[Reset] ❌ Failed to reset plan');
    }
    process.exit(0);
}

resetPlan();
