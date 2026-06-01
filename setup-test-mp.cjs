const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
const readline = require('readline');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const SANDBOX_DRIVER_ID = 'lqJ6fP8HxKerF7f4u0iK41dH2lw2';
const EDUARDO_REAL_ID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
const EDUARDO_REAL_MP_ID = 665467758;

// Function to hide input while typing
rl._writeToOutput = function _writeToOutput(stringToWrite) {
  if (rl.stdoutMuted)
    rl.output.write("*");
  else
    rl.output.write(stringToWrite);
};

rl.question('Pegá acá el Access Token (APP_USR-...) del Seller Test User: ', async (token) => {
  rl.stdoutMuted = false;
  console.log('\n\n[1/5] Token recibido de forma segura. Validando con Mercado Pago...');
  
  if (!token || !token.startsWith('APP_USR-')) {
    console.error('Error: El token no parece válido (debe empezar con APP_USR-). Abortando.');
    process.exit(1);
  }

  try {
    // Check token with MP API
    const mpRes = await fetch('https://api.mercadopago.com/users/me', {
      headers: { 'Authorization': `Bearer ${token.trim()}` }
    });

    if (!mpRes.ok) {
      console.error(`Error: Token inválido o expirado. Status de Mercado Pago: ${mpRes.status}`);
      process.exit(1);
    }

    const mpData = await mpRes.json();
    const testMpUserId = mpData.id;
    
    console.log(`[2/5] Perfil obtenido de Mercado Pago. NICKNAME: ${mpData.nickname}`);
    
    if (String(testMpUserId) === String(EDUARDO_REAL_MP_ID)) {
      console.error(`\n[CRÍTICO] El token ingresado pertenece a la cuenta real de Eduardo (mpUserId: ${EDUARDO_REAL_MP_ID}).`);
      console.error('Abortando por seguridad. No se hicieron cambios.');
      process.exit(1);
    }

    console.log(`[3/5] Validación exitosa: El mpUserId (${testMpUserId}) es distinto al real de Eduardo.`);

    // Check that real account hasn't been touched before we proceed
    const eduardoDocBefore = await db.collection('mp_accounts').doc(EDUARDO_REAL_ID).get();
    const eduardoUpdatedAtBefore = eduardoDocBefore.data()?.updatedAt?.toMillis();

    // Save to test driver
    console.log(`[4/5] Guardando credenciales en mp_accounts/${SANDBOX_DRIVER_ID}...`);
    await db.collection('mp_accounts').doc(SANDBOX_DRIVER_ID).set({
      status: 'linked',
      environment: 'sandbox',
      ownerType: 'test',
      accessToken: token.trim(),
      mpUserId: testMpUserId,
      nickname: mpData.nickname,
      site_id: mpData.site_id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Verify Eduardo's account wasn't touched
    const eduardoDocAfter = await db.collection('mp_accounts').doc(EDUARDO_REAL_ID).get();
    const eduardoUpdatedAtAfter = eduardoDocAfter.data()?.updatedAt?.toMillis();

    if (eduardoUpdatedAtBefore !== eduardoUpdatedAtAfter) {
      console.warn('\n[ADVERTENCIA] La cuenta real de Eduardo parece haber cambiado durante la operación.');
    } else {
      console.log(`[5/5] Confirmado: La cuenta real de Eduardo (mp_accounts/${EDUARDO_REAL_ID}) NO fue modificada.`);
    }

    console.log('\n✅ ¡Listo! Conductor sandbox configurado correctamente con el Seller Test User.');
    process.exit(0);
    
  } catch (error) {
    console.error('Error inesperado:', error);
    process.exit(1);
  }
});
rl.stdoutMuted = true;
