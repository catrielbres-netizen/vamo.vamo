import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({
    projectId: "studio-6697160840-7c67f"
  });
}

const db = getFirestore();
const uid = "VyuJeUd6dacno4m5yLyZlN9OKo43";

async function unblock() {
  console.log(`Unblocking user ${uid}...`);
  await db.collection('users').doc(uid).update({
    blockedUntil: null,
    isSuspended: false
  });
  console.log("Done.");
}

unblock().catch(console.error);
