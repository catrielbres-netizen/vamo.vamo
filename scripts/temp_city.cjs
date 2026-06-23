const admin = require('firebase-admin');
admin.initializeApp({ projectId: "studio-6697160840-7c67f" });
admin.firestore().doc('cities/rawson').get().then(s => {
    console.log(JSON.stringify(s.data(), null, 2));
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
