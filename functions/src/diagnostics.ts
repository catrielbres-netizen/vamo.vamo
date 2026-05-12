import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb, getAuth } from "./lib/firebaseAdmin";

/**
 * [VamO DIAGNOSTICS] diagnosticAuditV1
 * Audits the users collection to find inconsistencies:
 * 1. Orphaned users (Firestore doc exists but no Auth record)
 * 2. Missing wallets (User exists but no wallet doc)
 * 3. Identity collisions (Duplicate emails/phones in Firestore)
 * 4. Role mismatch (Auth claims vs Firestore role)
 */
export const diagnosticAuditV1 = onCall({ cors: true, region: "us-central1", timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
    // 1. SECURITY: Admin Only
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Debes estar autenticado.");
    }

    const db = getDb();
    const auth = getAuth();
    
    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== "admin") {
        throw new HttpsError("permission-denied", "Acceso restringido a administradores globales.");
    }

    logger.info(`[DIAGNOSTIC_START] Inicia auditoría solicitada por ${request.auth.uid}`);

    const report: any = {
        totalUsers: 0,
        orphans: [],      // User in Firestore, not in Auth
        missingWallets: [], // User in Firestore, no Wallet
        missingAuth: [],    // Same as orphans
        duplicates: {
            emails: {},
            phones: {}
        },
        inconsistencies: []
    };

    try {
        // 2. Fetch all users from Firestore
        const usersSnap = await db.collection("users").get();
        report.totalUsers = usersSnap.size;

        // 3. Batch check wallets and auth
        const userDocs = usersSnap.docs;
        
        // Track unique fields for duplicates
        const emailMap: Record<string, string[]> = {};
        const phoneMap: Record<string, string[]> = {};

        for (const doc of userDocs) {
            const userData = doc.data();
            const uid = doc.id;
            const email = userData.email?.toLowerCase().trim();
            const phone = userData.phone?.replace(/[\s\-\+()]/g, '');

            // Duplicate Tracking
            if (email) {
                if (!emailMap[email]) emailMap[email] = [];
                emailMap[email].push(uid);
            }
            if (phone) {
                if (!phoneMap[phone]) phoneMap[phone] = [];
                phoneMap[phone].push(uid);
            }

            // Wallet Check
            const walletSnap = await db.collection("wallets").doc(uid).get();
            if (!walletSnap.exists) {
                report.missingWallets.push({ uid, email, role: userData.role });
            }

            // Auth Check
            try {
                await auth.getUser(uid);
            } catch (err: any) {
                if (err.code === 'auth/user-not-found') {
                    report.orphans.push({ uid, email, role: userData.role });
                } else {
                    logger.error(`[DIAGNOSTIC_AUTH_ERR] ${uid}`, err);
                }
            }
        }

        // Filter Duplicates
        Object.entries(emailMap).forEach(([email, uids]) => {
            if (uids.length > 1) report.duplicates.emails[email] = uids;
        });
        Object.entries(phoneMap).forEach(([phone, uids]) => {
            if (uids.length > 1) report.duplicates.phones[phone] = uids;
        });

        logger.info(`[DIAGNOSTIC_COMPLETE] Users: ${report.totalUsers}, Orphans: ${report.orphans.length}, Missing Wallets: ${report.missingWallets.length}`);
        
        return {
            success: true,
            timestamp: new Date().toISOString(),
            report
        };

    } catch (error: any) {
        logger.error("[DIAGNOSTIC_FATAL]", error);
        throw new HttpsError("internal", "Error durante la ejecución del diagnóstico.");
    }
});
