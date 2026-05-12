
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const auth = admin.auth();

async function setClaims() {
    const users = [
        {
            uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
            claims: { r: 'passenger', ck: 'rawson' }
        },
        {
            uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
            claims: { r: 'admin', ck: 'rawson' }
        }
    ];

    for (const u of users) {
        console.log(`Setting claims for ${u.uid}...`);
        await auth.setCustomUserClaims(u.uid, u.claims);
        console.log(`Claims set for ${u.uid}.`);
    }
}

setClaims().catch(console.error);
