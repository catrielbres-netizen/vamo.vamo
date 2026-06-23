import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const citiesSnap = await db.collection("cities").get();
  const cities: any[] = [];
  citiesSnap.forEach(doc => {
    cities.push({ id: doc.id, ...doc.data() });
  });
  console.log("Cities length:", cities.length);
  console.log("Cities:", cities.map(c => c.id));
}

run().catch(console.error);
