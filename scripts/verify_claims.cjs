// scripts/verify_claims.js
const admin = require('firebase-admin');
admin.initializeApp();
const uid = process.env.TARGET_UID;

if (!uid) { console.log("Falta TARGET_UID"); process.exit(1); }

admin.auth().getUser(uid).then(user => {
  const up = uid.substring(0, 6);
  console.log(`--- Verificación para ${up}... ---`);
  console.log("Custom Claims:", JSON.stringify(user.customClaims || {}, null, 2));
}).catch(console.error);
