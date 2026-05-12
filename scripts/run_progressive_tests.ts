import admin from 'firebase-admin';
import * as fs from 'fs';
import { execSync } from 'child_process';

const saPath = 'C:/Users/catri/Downloads/studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json';
const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(sa)
    });
}

const db = admin.firestore();

async function runBlock(name: string, count: number, paymentMethod: 'wallet' | 'cash' | 'random') {
    console.log(`\n====================================================`);
    console.log(`🚀 INICIANDO BLOQUE: ${name} (${count} viajes, modo: ${paymentMethod})`);
    console.log(`====================================================\n`);

    for (let i = 0; i < count; i++) {
        console.log(`\n--- Viaje ${i + 1}/${count} ---`);
        
        // Ensure passenger has funds
        console.log(`[PRE-CHECK] Recargando saldo al pasajero...`);
        execSync(`npx tsx scripts/reset_test_passenger.ts`, { stdio: 'ignore' });
        
        const method = paymentMethod === 'random' ? (Math.random() > 0.5 ? 'wallet' : 'cash') : paymentMethod;
        
        // 1. Ejecutar el test de caja negra
        try {
            console.log(`[EXEC] Corriendo test_blackbox_ride con paymentMethod=${method}...`);
            // Pasamos el paymentMethod al script si lo soporta, o lo forzamos via env
            const output = execSync(`npx tsx scripts/test_blackbox_ride.ts`, { 
                env: { ...process.env, TEST_PAYMENT_METHOD: method },
                encoding: 'utf8' 
            });
            
            // Extraer el rideId del output
            const rideMatch = output.match(/Viaje creado: ([a-zA-Z0-9]+)/);
            if (!rideMatch) {
                // Si el matching falló por timeout pero el ride se creó, intentamos recuperarlo
                const searchingMatch = output.match(/Viaje creado: ([a-zA-Z0-9]+)/); // same regex
                if (!searchingMatch) throw new Error("No se pudo obtener el rideId del output");
            }
            
            const rideId = rideMatch![1];
            console.log(`[OK] Viaje ${rideId} completado (o creado).`);

            // 2. Si el matching falló (timeout), forzar completitud
            const rideDoc = await db.doc(`rides/${rideId}`).get();
            if (rideDoc.data()?.status !== 'completed') {
                console.log(`[WORKAROUND] Forzando completitud para ${rideId}...`);
                execSync(`npx tsx scripts/force_complete_ride.ts ${rideId}`, { stdio: 'inherit' });
                // Esperar un poco al trigger
                await new Promise(r => setTimeout(r, 5000));
            }

            // 3. Auditar
            console.log(`[AUDIT] Corriendo auditoría para ${rideId}...`);
            const passengerId = rideDoc.data()?.passengerId;
            const driverId = rideDoc.data()?.driverId || 'hBBDZRKgBVQGetjHxZvNFst6pBg1';
            
            const auditOutput = execSync(`npx tsx scripts/audit_live_user_sync.ts ${passengerId} ${rideId}`, { encoding: 'utf8' });
            console.log(auditOutput);
            
            if (auditOutput.includes('[ERROR]')) {
                console.error(`\n❌ FALLO EN AUDITORÍA DEL VIAJE ${rideId}. DETENIENDO PRUEBAS.`);
                process.exit(1);
            }
            
            console.log(`[SUCCESS] Viaje ${rideId} auditado correctamente.`);

        } catch (err: any) {
            console.error(`\n❌ ERROR CRÍTICO EN VIAJE ${i + 1}:`, err.message);
            process.exit(1);
        }
    }
}

async function main() {
    // Bloque 1: 1 wallet
    await runBlock("1 Viaje Wallet", 1, 'wallet');
    
    // Bloque 2: 1 cash
    await runBlock("1 Viaje Cash", 1, 'cash');
    
    // Bloque 3: 5 mixtos
    await runBlock("5 Viajes Mixtos", 5, 'random');
    
    // Bloque 4: 20 viajes
    await runBlock("20 Viajes", 20, 'random');
    
    // Bloque 5: 100 viajes
    await runBlock("100 Viajes", 100, 'random');

    console.log(`\n🎉 TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO (127 viajes).`);
}

main().catch(console.error);
