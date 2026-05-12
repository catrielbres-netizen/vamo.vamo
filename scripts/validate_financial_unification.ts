import admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = 'studio-6697160840-7c67f';

// Use emulator if host is provided
if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`📡 Connecting to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    admin.initializeApp({ projectId: PROJECT_ID });
} else {
    // Attempt local auth or fail gracefully
    try {
        admin.initializeApp({ projectId: PROJECT_ID });
    } catch (e) {
        console.warn("⚠️ Firebase Admin could not initialize. Ensure FIRESTORE_EMULATOR_HOST is set.");
    }
}

const db = admin.firestore();

// --- CORE LOGIC REPRODUCTION ---

async function getOrCreateWallet(userId: string, tx: admin.firestore.Transaction) {
    const walletRef = db.doc(`wallets/${userId}`);
    const userRef = db.doc(`users/${userId}`);
    const snap = await tx.get(walletRef);
    let walletData = snap.exists ? (snap.data() as any) : null;

    if (!walletData || walletData.legacyMigrated !== true) {
        const userSnap = await tx.get(userRef);
        if (userSnap.exists) {
            const userData = userSnap.data() as any;
            const legacyBalance = userData.currentBalance || 0;
            const currentCash = walletData?.cashBalance || 0;
            const newCash = currentCash + legacyBalance;
            tx.set(walletRef, { userId, cashBalance: newCash, legacyMigrated: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            tx.update(userRef, { currentBalance: newCash, updatedAt: FieldValue.serverTimestamp() });
            console.log(`   [MIGRATION] userId=${userId} migratedBalance=${legacyBalance} -> newTotal=${newCash}`);
            walletData = { ...walletData, cashBalance: newCash, legacyMigrated: true };
        }
    }
    return walletData || snap.data();
}

async function addFunds(userId: string, amount: number, tx: admin.firestore.Transaction) {
    const wallet = await getOrCreateWallet(userId, tx);
    const newCash = (wallet.cashBalance || 0) + amount;
    tx.set(db.doc(`wallets/${userId}`), { cashBalance: newCash, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(db.doc(`users/${userId}`), { currentBalance: FieldValue.increment(amount), updatedAt: FieldValue.serverTimestamp() });
}

async function consumeLockedWallet(userId: string, rideId: string, cashToConsume: number, promoToConsume: number, tx: admin.firestore.Transaction) {
    const lockRef = db.collection('wallet_transactions').doc(`lock_${rideId}`);
    const lockSnap = await tx.get(lockRef);
    if (!lockSnap.exists) {
        throw new Error(`LOCK_NOT_FOUND: No se puede consumir saldo no bloqueado para viaje ${rideId}`);
    }

    const wallet = await getOrCreateWallet(userId, tx);
    const walletRef = db.doc(`wallets/${userId}`);
    const userRef = db.doc(`users/${userId}`);

    if ((wallet.lockedCash || 0) < cashToConsume) {
        throw new Error(`INSUFFICIENT_LOCKED_FUNDS: Bloqueado ${wallet.lockedCash}, Requerido ${cashToConsume}`);
    }

    const newCashBalance = (wallet.cashBalance || 0) - cashToConsume;
    const newLockedCash = (wallet.lockedCash || 0) - cashToConsume;
    
    tx.update(walletRef, {
        cashBalance: newCashBalance,
        lockedCash: newLockedCash,
        updatedAt: FieldValue.serverTimestamp()
    });

    tx.update(userRef, {
        currentBalance: FieldValue.increment(-cashToConsume),
        updatedAt: FieldValue.serverTimestamp()
    });
}

async function processWithdrawal(userId: string, amount: number, tx: admin.firestore.Transaction) {
    const wallet = await getOrCreateWallet(userId, tx);
    const previousBalance = wallet.cashBalance || 0;
    
    // VALIDATION P1
    if (previousBalance < amount) {
        throw new Error(`INSUFFICIENT_FUNDS: Disponible ${previousBalance}, Requerido ${amount}`);
    }

    const newBalance = previousBalance - amount;
    tx.set(db.doc(`wallets/${userId}`), { cashBalance: newBalance, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(db.doc(`users/${userId}`), { currentBalance: FieldValue.increment(-amount), updatedAt: FieldValue.serverTimestamp() });
}

// --- TEST RUNNER ---

async function runTests() {
    console.log('🚀 STARTING REAL FINANCIAL VALIDATION (5 CASES)');
    console.log('==============================================');

    // CASE 1: Legacy + addFunds
    const uid1 = 'val_legacy_1';
    await db.doc(`users/${uid1}`).set({ currentBalance: 1000, name: 'Case 1' });
    await db.doc(`wallets/${uid1}`).delete();
    console.log('\n[CASE 1] Legacy Migration + $500 Top-up');
    await db.runTransaction(tx => addFunds(uid1, 500, tx));
    await logState(uid1);

    // CASE 2: Passenger pays VamO Pay
    const uid2 = 'val_pass_2';
    const rid2 = 'ride_val_2';
    await db.doc(`users/${uid2}`).set({ currentBalance: 2000, name: 'Case 2' });
    await db.doc(`wallets/${uid2}`).set({ cashBalance: 2000, lockedCash: 700, legacyMigrated: true });
    // [HARDENING] Create mandatory lock record
    await db.collection('wallet_transactions').doc(`lock_${rid2}`).set({ userId: uid2, rideId: rid2, amount: 700, type: 'ride_wallet_lock', createdAt: FieldValue.serverTimestamp() });
    
    console.log('\n[CASE 2] Passenger Payment ($700) with Mandatory Lock');
    await db.runTransaction(tx => consumeLockedWallet(uid2, rid2, 700, 0, tx));
    await logState(uid2);

    // CASE 3: Driver Earning
    const uid3 = 'val_driver_3';
    await db.doc(`users/${uid3}`).set({ currentBalance: 0, name: 'Case 3' });
    await db.doc(`wallets/${uid3}`).set({ cashBalance: 0, legacyMigrated: true });
    console.log('\n[CASE 3] Driver Earning ($1200)');
    await db.runTransaction(tx => addFunds(uid3, 1200, tx));
    await logState(uid3);

    // CASE 4: Withdrawal Success
    const uid4 = 'val_withdraw_4';
    await db.doc(`users/${uid4}`).set({ currentBalance: 1000, name: 'Case 4' });
    await db.doc(`wallets/${uid4}`).set({ cashBalance: 1000, legacyMigrated: true });
    console.log('\n[CASE 4] Withdrawal Approval ($500) - Sufficient Funds');
    await db.runTransaction(tx => processWithdrawal(uid4, 500, tx));
    await logState(uid4);

    // CASE 5: Withdrawal Failure
    const uid5 = 'val_withdraw_5';
    await db.doc(`users/${uid5}`).set({ currentBalance: 200, name: 'Case 5' });
    await db.doc(`wallets/${uid5}`).set({ cashBalance: 200, legacyMigrated: true });
    console.log('\n[CASE 5] Withdrawal Approval ($500) - Insufficient Funds');
    try {
        await db.runTransaction(tx => processWithdrawal(uid5, 500, tx));
        console.log('   ❌ ERROR: Transaction should have failed but passed.');
    } catch (e: any) {
        console.log(`   ✅ SUCCESS: Transaction aborted as expected: ${e.message}`);
    }
    await logState(uid5);

    console.log('\n==============================================');
    console.log('🏁 VALIDATION COMPLETE');
}

async function logState(uid: string) {
    const u = (await db.doc(`users/${uid}`).get()).data();
    const w = (await db.doc(`wallets/${uid}`).get()).data();
    console.log(`   RESULT -> user.bal: ${u?.currentBalance}, wallet.bal: ${w?.cashBalance}, migrated: ${w?.legacyMigrated}`);
    if (u?.currentBalance !== w?.cashBalance) {
        console.log(`   ⚠️ DRIFT DETECTED! Balances are not synced.`);
    }
}

runTests().catch(console.error);
