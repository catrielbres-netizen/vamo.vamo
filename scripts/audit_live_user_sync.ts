import admin from 'firebase-admin';
import * as fs from 'fs';

/**
 * VamO Financial Auditor - Live Production Sync Check
 * 
 * Usage: npx ts-node scripts/audit_live_user_sync.ts <userId> [rideId]
 */

const PROJECT_ID = 'studio-6697160840-7c67f';

// Initialize Admin
if (!admin.apps.length) {
    const saPath = 'C:/Users/catri/Downloads/studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json';
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(sa)
    });
}

const db = admin.firestore();

async function auditUser(userId: string, rideId?: string) {
    console.log(`\n🔍 AUDITING FINANCIAL SYNC FOR USER: ${userId}`);
    console.log(`====================================================`);

    // 1. USER VS WALLET
    const userSnap = await db.doc(`users/${userId}`).get();
    const walletSnap = await db.doc(`wallets/${userId}`).get();

    if (!userSnap.exists) {
        console.error(`[ERROR] User document not found: ${userId}`);
        return;
    }

    const userData = userSnap.data() as any;
    const walletData = walletSnap.exists ? (walletSnap.data() as any) : null;

    const userBal = userData.currentBalance || 0;
    const walletBal = walletData?.cashBalance || 0;
    const migrated = walletData?.legacyMigrated || false;

    console.log(`\n1. BALANCE SYNC CHECK:`);
    if (userBal === walletBal) {
        console.log(`   [OK] Balances match: $${userBal}`);
    } else {
        console.error(`   [ERROR] BALANCE DRIFT! User: $${userBal} | Wallet: $${walletBal}`);
        console.error(`   DIFF: $${userBal - walletBal}`);
    }

    if (migrated) {
        console.log(`   [OK] Wallet is marked as legacyMigrated: true`);
    } else {
        console.warn(`   [WARN] Wallet NOT MIGRATED yet (legacyMigrated: false/missing)`);
    }

    // 2. WALLET TRANSACTIONS (Passenger/Generic)
    console.log(`\n2. RECENT WALLET TRANSACTIONS (Last 5):`);
    const txSnap = await db.collection('wallet_transactions')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

    if (txSnap.empty) {
        console.log(`   (No transactions found)`);
    } else {
        txSnap.docs.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt?.toDate?.()?.toISOString() || 'N/A';
            console.log(`   - [${date}] Type: ${data.type.padEnd(15)} | Amt: $${data.amount.toString().padEnd(6)} | Bal: ${data.balanceBeforeCash || 0} -> ${data.balanceAfterCash || 0}`);
        });
    }

    // 3. WALLET MOVEMENTS (Driver Ledger)
    if (userData.role === 'driver') {
        console.log(`\n3. RECENT WALLET MOVEMENTS (Driver Ledger - Last 5):`);
        const moveSnap = await db.collection('wallet_movements')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (moveSnap.empty) {
            console.log(`   (No movements found)`);
        } else {
            moveSnap.docs.forEach(doc => {
                const data = doc.data();
                const date = data.createdAt?.toDate?.()?.toISOString() || 'N/A';
                console.log(`   - [${date}] Type: ${data.type.padEnd(15)} | Amt: $${data.amount.toString().padEnd(6)} | Bal: ${data.balanceBefore || 0} -> ${data.balanceAfter || 0}`);
            });
        }
    }

    // 4. RIDE VALIDATION
    if (rideId) {
        console.log(`\n4. RIDE INTEGRITY CHECK: ${rideId}`);
        const rideSnap = await db.doc(`rides/${rideId}`).get();
        
        if (!rideSnap.exists) {
            console.error(`   [ERROR] Ride document not found: ${rideId}`);
        } else {
            const rideData = rideSnap.data() as any;
            
            // Basic Ride Check
            if (rideData.status === 'completed' && rideData.settledAt && rideData.completedRide) {
                console.log(`   [OK] Ride status is completed and settled.`);
            } else {
                console.error(`   [ERROR] Ride state inconsistent: Status=${rideData.status}, Settled=${!!rideData.settledAt}, Completed=${!!rideData.completedRide}`);
            }

            // Passenger Check (if applicable)
            if (rideData.passengerId === userId) {
                const consumeSnap = await db.doc(`wallet_transactions/consume_${rideId}`).get();
                if (consumeSnap.exists) {
                    console.log(`   [OK] Passenger: wallet_transaction consume_${rideId} exists.`);
                } else if (rideData.paymentMethod === 'cash') {
                    console.log(`   [INFO] Passenger: Cash trip, no wallet consumption expected.`);
                } else {
                    console.error(`   [ERROR] Passenger: MISSING wallet_transaction consume_${rideId} for digital trip!`);
                }
            }

            // Driver Check (if applicable)
            if (rideData.driverId === userId) {
                const earningSnap = await db.doc(`wallet_movements/ride_earning_${rideId}`).get();
                if (earningSnap.exists) {
                    console.log(`   [OK] Driver: wallet_movement ride_earning_${rideId} exists.`);
                } else {
                    console.error(`   [ERROR] Driver: MISSING wallet_movement ride_earning_${rideId}!`);
                }
            }
        }
    }

    console.log(`\n====================================================`);
    console.log(`🏁 AUDIT COMPLETE FOR ${userId}\n`);
}

// CLI Arg Parsing
const args = process.argv.slice(2);
const uId = args[0];
const rId = args[1];

if (!uId) {
    console.log("Usage: npx ts-node scripts/audit_live_user_sync.ts <userId> [rideId]");
    process.exit(1);
}

auditUser(uId, rId).catch(console.error);
