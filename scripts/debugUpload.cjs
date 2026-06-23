const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = 'C:\\Users\\catri\\keys\\serviceAccountKey.json';
let app;
try {
  if (fs.existsSync(serviceAccountPath)) {
    app = admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath))
    });
  } else {
    console.log("No service account found, using default");
    app = admin.initializeApp();
  }
} catch (e) {
  console.log("Error initializing admin:", e);
}

const db = admin.firestore();

async function run() {
  const uid = 'tjDMD6GVF6OYe0h7w4kkjoXaHP93';
  const uploadingDoc = 'driverLicense';
  const uploadCityKey = 'rawson';
  const url = 'https://fake-url.com/doc.jpg';
  const docPath = `municipal_docs/${uploadCityKey}/${uid}/${uploadingDoc}_1234.jpg`;

  console.log("=== STEP 1: READ PROFILE ===");
  let munProfile = null;
  try {
    const pSnap = await db.collection('municipal_profiles').doc(uid).get();
    if (pSnap.exists) {
        munProfile = pSnap.data();
        console.log("Profile exists:", JSON.stringify(munProfile, null, 2));
    } else {
        console.log("Profile does not exist.");
    }
  } catch (e) {
    console.log("Error reading profile", e);
  }

  let profile = null;
  try {
    const uSnap = await db.collection('users').doc(uid).get();
    if (uSnap.exists) {
        profile = uSnap.data();
        console.log("User profile driverSubtype:", profile.driverSubtype, "role:", profile.role);
    }
  } catch (e) {
    console.log("Error reading users", e);
  }

  console.log("\n=== STEP 2: BUILD municipal_doc_submissions PAYLOAD ===");
  const submissionPayload = {
      driverId: uid,
      municipalCode: munProfile?.municipalCode || null,
      cityKey: uploadCityKey,
      docType: uploadingDoc,
      storageUrl: url,
      storagePath: docPath,
      status: 'pending_review',
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  console.log(JSON.stringify(submissionPayload, null, 2));

  console.log("\n=== STEP 3: BUILD municipal_profiles PAYLOAD ===");
  const updatePayload = {
      municipalStatus: 'renewal_under_review',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      cityKey: uploadCityKey,
  };

  if (!munProfile) {
      updatePayload.uid = uid;
      updatePayload.driverSubtype = profile?.driverSubtype || 'express';
      if (profile?.driverSubtype === 'fleet_driver') {
          updatePayload.vehicleOwnerId = profile?.vehicleOwnerId || null;
          updatePayload.vehicleId = profile?.vehicleId || null;
      }
      updatePayload.createdBy = 'driver_document_upload';
  }

  updatePayload[`checklist.${uploadingDoc}`] = {
      status: 'submitted',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      storageUrl: url
  };
  console.log(JSON.stringify(updatePayload, null, 2));

  console.log("\n=== STEP 4: BUILD municipal_audit_log PAYLOAD ===");
  const auditPayload = {
      driverId: uid,
      municipalCode: munProfile?.municipalCode || null,
      cityKey: uploadCityKey,
      actionBy: uid,
      actionByRole: 'driver',
      action: 'renewal_document_submitted',
      checklistKey: uploadingDoc,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  console.log(JSON.stringify(auditPayload, null, 2));
}

run().catch(console.error).finally(() => process.exit(0));
