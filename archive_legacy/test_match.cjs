process.env.GOOGLE_APPLICATION_CREDENTIALS = './service-account.json';

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

async function runMatch() {
    try {
        const { findNextDriverAndCreateOffer } = require('./functions/lib/rides.js');
        console.log("Running findNextDriverAndCreateOffer...");
        await findNextDriverAndCreateOffer('Pe1ctzoHo6SXxxUSItBO');
        console.log("Finished running.");
    } catch (e) {
        console.error("Crash during match:", e);
    }
    process.exit(0);
}

runMatch();
