import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function runCitiesDryRun() {
  console.log(`\n=== DRY RUN: LIMPIEZA DE CIUDADES DE PRUEBA ===`);
  
  // A) Qué colección alimenta el Expansión Hub
  console.log(`\nA) ¿Qué colección alimenta el Expansión Hub?`);
  console.log(`   El panel de "Expansión Hub" lee directamente de la colección 'cities'.`);
  console.log(`   Las invitaciones se leen de la colección 'municipal_onboarding_invites'.`);
  console.log(`   La configuración base/pricing se lee de la colección 'ciudades' o 'city_config'.`);

  // B) Documentos que existen actualmente
  console.log(`\nB) Documentos de ciudad existentes actualmente:`);
  
  const citiesSnap = await db.collection('cities').get();
  const ciudadesSnap = await db.collection('ciudades').get();
  const cityConfigSnap = await db.collection('city_config').get();
  const invitesSnap = await db.collection('municipal_onboarding_invites').get();

  const allCities = citiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allCiudades = ciudadesSnap.docs.map(d => d.id);
  const allCityConfig = cityConfigSnap.docs.map(d => d.id);
  const allInvites = invitesSnap.docs.map(d => ({ id: d.id, cityKey: d.data().cityKey }));

  console.log(`   - En colección 'cities': ${allCities.map(c => c.id).join(', ') || 'Ninguno'}`);
  console.log(`   - En colección 'ciudades': ${allCiudades.join(', ') || 'Ninguno'}`);
  console.log(`   - En colección 'city_config': ${allCityConfig.join(', ') || 'Ninguno'}`);
  console.log(`   - En colección 'municipal_onboarding_invites': ${allInvites.map(i => i.cityKey).join(', ') || 'Ninguno'}`);

  // C) Cuáles se eliminarían
  const citiesToDelete = allCities.filter(c => c.id !== 'rawson' && c.cityKey !== 'rawson');
  const ciudadesToDelete = allCiudades.filter(id => id !== 'rawson');
  const cityConfigToDelete = allCityConfig.filter(id => id !== 'rawson');
  const invitesToDelete = allInvites.filter(i => i.cityKey !== 'rawson');

  console.log(`\nC) Cuáles se ELIMINARÍAN:`);
  console.log(`   - De 'cities': ${citiesToDelete.map(c => c.id).join(', ') || 'Ninguno'}`);
  console.log(`   - De 'ciudades': ${ciudadesToDelete.join(', ') || 'Ninguno'}`);
  console.log(`   - De 'city_config': ${cityConfigToDelete.join(', ') || 'Ninguno'}`);
  console.log(`   - De 'municipal_onboarding_invites': ${invitesToDelete.map(i => i.id).join(', ') || 'Ninguno'}`);

  // D) Cuáles se conservarían
  const citiesToKeep = allCities.filter(c => c.id === 'rawson' || c.cityKey === 'rawson');
  const ciudadesToKeep = allCiudades.filter(id => id === 'rawson');
  const cityConfigToKeep = allCityConfig.filter(id => id === 'rawson');
  
  console.log(`\nD) Cuáles se CONSERVARÍAN:`);
  console.log(`   - De 'cities': ${citiesToKeep.map(c => c.id).join(', ') || 'Ninguno'}`);
  console.log(`   - De 'ciudades': ${ciudadesToKeep.join(', ') || 'Ninguno'}`);
  console.log(`   - De 'city_config': ${cityConfigToKeep.join(', ') || 'Ninguno'}`);

  // E) Confirmación de Rawson intacta
  console.log(`\nE) Confirmación sobre Rawson:`);
  console.log(`   ✓ Todo documento con ID o cityKey 'rawson' ha sido excluido de la lista de eliminación.`);
  console.log(`   ✓ Las colecciones 'ciudades' y 'city_config' conservarán su configuración intacta para Rawson.`);

  // F) Cantidad final esperada
  console.log(`\nF) Cantidad final esperada después de limpiar:`);
  console.log(`   - Panel Expansión Hub ('cities'): ${citiesToKeep.length} ciudad(es) visible(s)`);
  console.log(`   - Colección 'ciudades': ${ciudadesToKeep.length} documento(s)`);
  console.log(`   - Colección 'city_config': ${cityConfigToKeep.length} documento(s)`);
  console.log(`   - Colección 'municipal_onboarding_invites': ${allInvites.length - invitesToDelete.length} documento(s)\n`);
}

runCitiesDryRun().catch(console.error);
