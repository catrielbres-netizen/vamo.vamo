
import admin from 'firebase-admin';
import * as path from 'path';

// Use environment variable for the service account path
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');

const SUPER_ADMIN_EMAIL = 'superadmin@vamo.local';
const SUPER_ADMIN_PASSWORD = 'VamoSuperAdmin2026!'; // Temporary secure password

async function createSuperAdmin() {
    console.log(`🚀 Starting Super Admin Creation for ${SUPER_ADMIN_EMAIL}...`);

    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        console.log("✅ Firebase Admin initialized.");
    } catch (e: any) {
        console.error("❌ Failed to initialize Admin SDK:", e.message);
        process.exit(1);
    }

    const auth = admin.auth();
    const db = admin.firestore();

    try {
        // 1. Create or Update Auth User
        let user;
        try {
            user = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
            console.log(`🔍 User exists (UID: ${user.uid}). Updating...`);
            await auth.updateUser(user.uid, {
                emailVerified: true,
                disabled: false,
                password: SUPER_ADMIN_PASSWORD
            });
        } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
                console.log("✨ Creating new Super Admin user...");
                user = await auth.createUser({
                    email: SUPER_ADMIN_EMAIL,
                    password: SUPER_ADMIN_PASSWORD,
                    emailVerified: true,
                    disabled: false,
                    displayName: "Super Admin VamO"
                });
            } else {
                throw err;
            }
        }

        const uid = user.uid;

        // 2. Set Custom Claims
        const customClaims = {
            r: "superadmin",
            role: "superadmin",
            admin: true,
            superadmin: true,
            cities: ["*"],
            permissions: ["*"],
            v: 1
        };
        await auth.setCustomUserClaims(uid, customClaims);
        console.log("🔐 Custom Claims set successfully.");

        // 3. Create/Update Firestore Profile
        const userRef = db.collection('users').doc(uid);
        const profileData = {
            uid,
            email: SUPER_ADMIN_EMAIL,
            emailLower: SUPER_ADMIN_EMAIL.toLowerCase(),
            name: "Super Admin VamO",
            role: "superadmin",
            city: "Global",
            cityKey: "global",
            approved: true,
            isSuspended: false,
            emailVerified: true,
            profileCompleted: true,
            registrationStatus: "active",
            permissions: ["*"],
            cities: ["*"],
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const snap = await userRef.get();
        if (!snap.exists) {
            await userRef.set({
                ...profileData,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await userRef.update(profileData);
        }
        console.log("📄 Firestore profile synchronized.");

        // 4. Verification & Output
        const finalUser = await auth.getUser(uid);
        console.log("\n-----------------------------------------");
        console.log("📊 SUPER ADMIN AUDIT:");
        console.log("- UID:", finalUser.uid);
        console.log("- Email:", finalUser.email);
        console.log("- Email Verified:", finalUser.emailVerified);
        console.log("- Disabled:", finalUser.disabled);
        console.log("- Custom Claims:", JSON.stringify(finalUser.customClaims, null, 2));
        console.log("- Firestore Profile: OK");
        console.log("- Temporary Password:", SUPER_ADMIN_PASSWORD);
        console.log("-----------------------------------------");
        
        console.log("\n🔑 LOGIN INSTRUCTIONS:");
        console.log(`1. Email: ${SUPER_ADMIN_EMAIL}`);
        console.log(`2. Password: ${SUPER_ADMIN_PASSWORD}`);
        console.log("3. IMPORTANT: Change password after first login.");
        console.log("4. Ensure all guards and rules are deployed before testing.");

        console.log("\n🎉 SUCCESS! Super Admin is now fully established.");
        process.exit(0);

    } catch (error: any) {
        console.error("❌ CRITICAL ERROR:", error.message);
        process.exit(1);
    }
}

createSuperAdmin();
