const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, connectAuthEmulator } = require('firebase/auth');
const { getFirestore, doc, setDoc, connectFirestoreEmulator, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  projectId: "vamo-vamo-6b24d",
  appId: "1:1234:web:1234",
  apiKey: "fake-api-key"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, 'http://127.0.0.1:9099');
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function test() {
  try {
    const email = `test_pass_${Date.now()}@example.com`;
    console.log("Creating user", email);
    const { user } = await createUserWithEmailAndPassword(auth, email, "password123");
    console.log("User created", user.uid);
    
    const userPayload = {
        uid: user.uid,
        role: 'passenger',
        name: '',
        email: user.email,
        referredByCode: null,
        createdAt: serverTimestamp(),
        profileCompleted: false
    };

    console.log("Writing to Firestore...");
    await setDoc(doc(db, 'users', user.uid), userPayload);
    console.log("Success!");
  } catch (e) {
    console.error("Error:", e.message);
  }
  process.exit();
}
test();
