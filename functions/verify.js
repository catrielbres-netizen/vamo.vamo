const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
admin.auth().getUserByEmail('q@gmail.com').then(user => {
  return admin.auth().updateUser(user.uid, { emailVerified: true });
}).then(() => {
  console.log('Done');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
