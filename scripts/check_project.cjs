const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();
console.log('Project ID:', admin.app().options.projectId);
// Check if we can get the location from the database metadata
async function run() {
    const collections = await db.listCollections();
    console.log('Connected to:', admin.app().name);
}
run().catch(console.error);
