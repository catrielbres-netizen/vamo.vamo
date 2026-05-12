import admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

async function auditDuplicateUsers() {
    console.log("🕵️ auditing duplicate users...");
    const usersSnap = await db.collection('users').get();
    const emails = new Map<string, string[]>();
    const phones = new Map<string, string[]>();

    usersSnap.forEach(doc => {
        const data = doc.data();
        const uid = doc.id;
        const email = data.email?.toLowerCase().trim();
        const phone = data.phone?.trim();

        if (email) {
            const list = emails.get(email) || [];
            list.push(uid);
            emails.set(email, list);
        }
        if (phone) {
            const list = phones.get(phone) || [];
            list.push(uid);
            phones.set(phone, list);
        }
    });

    console.log("--- DUPLICATE EMAILS ---");
    emails.forEach((uids, email) => {
        if (uids.length > 1) {
            console.log(`[BUG] Email ${email} is used by: ${uids.join(', ')}`);
        }
    });

    console.log("--- DUPLICATE PHONES ---");
    phones.forEach((uids, phone) => {
        if (uids.length > 1) {
            console.log(`[BUG] Phone ${phone} is used by: ${uids.join(', ')}`);
        }
    });

    console.log("🕵️ audit complete.");
}

auditDuplicateUsers().catch(console.error);
