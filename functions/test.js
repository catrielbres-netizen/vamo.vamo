const admin = require('firebase-admin');
admin.initializeApp();
admin.firestore().doc('features/sharedRide').get().then(s => {
    console.log(s.data());
    process.exit(0);
}).catch(console.error);
