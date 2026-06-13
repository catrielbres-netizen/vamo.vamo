const admin = require('firebase-admin');
const serviceAccount = require('functions/serviceAccountKey.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function testWithdraw() {
    const userId = "VNhou0ag4wXXPr6IXa3foO6SI8B3";
    const walletRef = db.collection('wallets').doc(userId);
    
    try {
        await db.runTransaction(async (tx) => {
            const walletSnap = await tx.get(walletRef);
            if (!walletSnap.exists) {
                console.log("WALLET_NOT_FOUND");
                return;
            }

            const walletData = walletSnap.data();
            const grossReceiptsBalance = walletData?.grossReceiptsBalance || 0;

            if (grossReceiptsBalance <= 0) {
                console.log("NO_FUNDS");
                return;
            }

            if (walletData?.lastGrossReceiptsWithdrawalAt) {
                const lastWithdrawal = walletData.lastGrossReceiptsWithdrawalAt.toDate();
                const now = new Date();
                const diffTime = Math.abs(now.getTime() - lastWithdrawal.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays < 28) {
                    console.log("TOO_SOON");
                    return;
                }
            }

            // Simulated addWalletMovements
            const moveRef1 = db.collection('wallet_movements').doc(`grw_${Date.now()}_1`);
            const moveRef2 = db.collection('wallet_movements').doc(`grw_${Date.now()}_2`);
            
            // Reads
            await tx.get(moveRef1);
            await tx.get(moveRef2);
            await tx.get(walletRef);
            const userRef = db.collection('users').doc(userId);

            // Writes
            tx.set(walletRef, {
                cashBalance: (walletData.cashBalance || 0) + grossReceiptsBalance,
                grossReceiptsBalance: 0,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            tx.update(userRef, {
                currentBalance: admin.firestore.FieldValue.increment(grossReceiptsBalance),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            tx.update(walletRef, {
                lastGrossReceiptsWithdrawalAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log("Transaction logic completed successfully.");
        });
    } catch (e) {
        console.error("Error in transaction:", e);
    }
}
testWithdraw();
