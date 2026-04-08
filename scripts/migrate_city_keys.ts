import * as admin from 'firebase-admin';

// Re-implementar normalizeCityKey localmente para el script o importarlo si está configurado para eso.
// Por simplicidad en un script standalone, lo copiamos:
function normalizeCityKey(city: string): string {
    return city
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function run() {
    const db = admin.firestore();

    const snapshot = await db.collection('users')
        .where('role', 'in', ['admin_municipal'])
        .get();

    if (snapshot.empty) {
        console.log('No admin_municipal users found.');
        return;
    }

    let updatedCount = 0;
    const batch = db.batch(); // O usar promesas si son muchos, pero para admin_municipal batch es suficiente

    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.city) {
            const expectedCityKey = normalizeCityKey(data.city);
            if (data.cityKey !== expectedCityKey) {
                console.log(`Updating user ${doc.id} - City: ${data.city} -> cityKey: ${expectedCityKey}`);
                batch.update(doc.ref, { cityKey: expectedCityKey });
                updatedCount++;
            }
        }
    }

    if (updatedCount > 0) {
        await batch.commit();
        console.log(`Successfully updated ${updatedCount} admin_municipal users with cityKey.`);
    } else {
        console.log('All admin_municipal users already have the correct cityKey.');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
    run().then(() => process.exit(0)).catch(console.error);
}
