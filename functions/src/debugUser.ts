import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const debugUserStatusV1 = functions.https.onRequest(async (req, res) => {
    try {
        const db = admin.firestore();
        const email = req.query.email as string;
        if (!email) {
            res.status(400).send("Provide email query param");
            return;
        }

        const snap = await db.collection('users').where('email', '==', email).get();
        if (snap.empty) {
            res.status(404).send("User not found");
            return;
        }

        const data = snap.docs[0].data();
        
        let locData = null;
        const locSnap = await db.collection('drivers_locations').doc(snap.docs[0].id).get();
        if (locSnap.exists) {
            locData = locSnap.data();
        }

        res.json({
            id: snap.docs[0].id,
            role: data.role,
            isOnline: data.isOnline,
            termsVersion: data.termsVersion,
            driverRiskLevel: data.driverRiskLevel,
            approved: data.approved,
            walletBalance: data.walletBalance,
            locDataStatus: locData?.driverStatus,
            locDataApproved: locData?.approved
        });
    } catch(e: any) {
        res.status(500).send(e.message);
    }
});
