
import admin from "firebase-admin";
import * as path from "path";

// Initialize using environment variable for the service account
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  console.error("❌ ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
  console.log("✅ Firebase Admin initialized.");
} catch (error: any) {
  console.error("❌ Failed to initialize Admin SDK:", error.message);
  process.exit(1);
}

async function resetPassword() {
  const email = "superadmin@vamo.local";
  const newPassword = "Vamo#2026Secure!";

  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log("🔍 Found user UID:", user.uid);

    await admin.auth().updateUser(user.uid, {
      password: newPassword,
    });

    console.log("🚀 PASSWORD UPDATED successfully.");
    console.log("-----------------------------------------");
    console.log("Login details:");
    console.log("- Email:", email);
    console.log("- Password:", newPassword);
    console.log("-----------------------------------------");
    
    process.exit(0);
  } catch (error: any) {
    console.error("❌ ERROR resetting password:", error.message);
    process.exit(1);
  }
}

resetPassword();
