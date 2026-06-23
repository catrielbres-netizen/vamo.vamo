import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getDb } from "./lib/firebaseAdmin";

export const fixUserCityV1 = onRequest(async (req, res) => {
    try {
        const db = getDb();
        const snap = await db.collection("users").where("name", "==", "cesar eduardo bres").get();
        
        // Also add mercedes to cities collection
        await db.collection("cities").doc("mercedes").set({
            name: "Mercedes",
            province: "Buenos Aires",
            status: "active",
            enabled: true
        }, { merge: true });

        if (snap.empty) {
            res.send("Cities updated, but no user found with name cesar eduardo bres");
            return;
        }
        
        let fixedUsers = [];
        for (const doc of snap.docs) {
            await doc.ref.update({
                cityKey: "mercedes",
                city: "Mercedes"
            });
            fixedUsers.push(doc.id);
        }

        res.send(`Fixed users: ${fixedUsers.join(", ")}. Added Mercedes to cities.`);
    } catch (e: any) {
        res.status(500).send("Error: " + e.message);
    }
});
