const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function run() {
    const eduardoId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    console.log("Checking wallet movements for Eduardo...");
    
    const movs = await db.collection('wallet_movements')
        .where('userId', '==', eduardoId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
        
    movs.forEach(doc => {
        const data = doc.data();
        console.log(`[${doc.id}] Type: ${data.type}, Amount: ${data.amount}, Description: ${data.description}, Created: ${data.createdAt?.toDate()}`);
    });
    
    console.log("\nChecking wallet doc:");
    const wallet = await db.collection('wallets').doc(eduardoId).get();
    if (wallet.exists) {
        console.log(wallet.data());
    } else {
        console.log("Wallet doc not found");
    }
}

run().then(() => process.exit(0)).catch(console.error);
