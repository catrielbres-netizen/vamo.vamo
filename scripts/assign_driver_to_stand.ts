import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local variables
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('service-account.json');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function assignStand() {
  const driverEmail = 'cesareduardobres@gmail.com';
  const standId = 'stand_170e4b0f';
  const standName = 'BOCA';
  const targetCityKey = 'rawson';

  console.log(`Buscando conductor con email: ${driverEmail}`);
  const usersQuery = await db.collection('users').where('email', '==', driverEmail).get();

  if (usersQuery.empty) {
    console.log('❌ Conductor no encontrado.');
    return;
  }

  const userDoc = usersQuery.docs[0];
  const userData = userDoc.data();
  const driverId = userDoc.id;

  console.log(`✅ Conductor encontrado. UID: ${driverId}`);
  
  // 1. Verificar si es conductor
  if (userData.role !== 'driver') {
    console.log(`❌ El usuario no tiene rol de conductor. Rol actual: ${userData.role}`);
    return;
  }
  
  // 2. Verificar ciudad
  if (userData.cityKey !== targetCityKey) {
    console.log(`❌ El conductor pertenece a otra ciudad: ${userData.cityKey}`);
    return;
  }
  
  // 3. Verificar estado en municipal_profiles
  const muniDoc = await db.collection('municipal_profiles').doc(driverId).get();
  if (!muniDoc.exists) {
    console.log(`❌ El conductor no tiene perfil municipal.`);
    return;
  }
  
  const muniData = muniDoc.data() || {};
  if (muniData.municipalStatus !== 'active') {
    console.log(`❌ El conductor no está habilitado municipalmente. Estado: ${muniData.municipalStatus}`);
    return;
  }

  // Verificar tipo (remis/taxi) si existe. Generalmente está en drivers o en userData
  const driverDoc = await db.collection('drivers').doc(driverId).get();
  let driverData: any = {};
  if (driverDoc.exists) {
    driverData = driverDoc.data();
    console.log(`✅ Perfil de driver encontrado. Tipo: ${driverData.driverType || driverData.vehicleType || 'No especificado explícitamente'}`);
  }

  // Chequeo de que esté online (aunque no es estrictamente necesario bloquear la asignación por esto,
  // el usuario pidió verificar que "esté online/libre o pueda recibir viajes")
  const locDoc = await db.collection('drivers_locations').doc(driverId).get();
  if (locDoc.exists) {
    const locData = locDoc.data();
    console.log(`✅ Estado de conexión: online=${locData?.online}, status=${locData?.status}`);
  } else {
    console.log(`ℹ️ No se encontró ubicación activa (drivers_locations). Puede que esté offline.`);
  }

  console.log(`-----------------------------------------`);
  console.log(`Ejecutando vinculación...`);

  const now = new Date();
  
  // Update 1: drivers
  if (driverDoc.exists) {
    await db.collection('drivers').doc(driverId).update({
      stationId: standId,
      stationName: standName,
      stationAssignedAt: now,
      stationAssignedBy: 'admin-script'
    });
  } else {
    await db.collection('drivers').doc(driverId).set({
      stationId: standId,
      stationName: standName,
      stationAssignedAt: now,
      stationAssignedBy: 'admin-script'
    }, { merge: true });
  }

  // Update 2: users
  await db.collection('users').doc(driverId).update({
    stationId: standId,
    stationName: standName
  });

  // Update 3: municipal_profiles
  await db.collection('municipal_profiles').doc(driverId).update({
    stationId: standId,
    stationName: standName,
    stationAssignedAt: now,
    stationAssignedBy: 'admin-script'
  });

  console.log(`✅ Vinculación completada exitosamente.`);
  console.log(`- Documento afectado principal: ${driverId}`);
  console.log(`- Colecciones actualizadas: drivers, users, municipal_profiles`);
}

assignStand().catch(console.error);
