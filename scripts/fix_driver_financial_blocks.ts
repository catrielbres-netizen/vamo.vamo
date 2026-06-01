import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// [VamO PRO] Standalone Risk Engine logic for backfill script
function computeRiskLevel(driver: any, balance: number) {
    let score = 0;
    const reasons: string[] = [];
    let isHardBlocked = false;

    // A) Financiero
    const negativeLimit = driver.driverSubtype === 'professional' ? -15000 : -8000;
    
    if (balance < 0) {
        score += 10;
        reasons.push("Saldo pendiente");
    }
    
    if (balance <= negativeLimit * 0.8) {
        score += 25;
        reasons.push("Cerca del límite de deuda");
    }
    
    if (balance <= negativeLimit) {
        isHardBlocked = true;
        reasons.push("Límite de deuda alcanzado");
    }

    // B) Operativo
    const cancellations = driver.cancellationCount ?? 0;
    if (cancellations >= 3) {
        score += 15;
        reasons.push("Demasiadas cancelaciones recientes");
    }
    
    const ignored = driver.ignoredOffersCount ?? 0;
    if (ignored >= 5) {
        score += 10;
        reasons.push("Muchas ofertas ignoradas");
    }

    if ((driver.watchdogReleaseCount ?? 0) > 0) {
        score += 20;
        reasons.push("Intervenciones del sistema de seguridad");
    }

    // C) Municipal
    if (driver.municipalStatus === 'pending_municipal_review') {
        score += 5;
        reasons.push("Revisión municipal pendiente");
    }
    
    const blockedMuniStatuses = ['rejected', 'rejected_by_municipality', 'suspended', 'suspended_by_municipality'];
    if (blockedMuniStatuses.includes(driver.municipalStatus ?? '')) {
        isHardBlocked = true;
        reasons.push("Restricción municipal activa");
    }
    
    // D) Seguridad
    if ((driver.openPanicClaims ?? 0) > 0) {
        score += 30;
        reasons.push("Reclamo de seguridad abierto");
    }
    
    if ((driver.securityClaimsCount ?? 0) >= 2) {
        score += 20;
        reasons.push("Múltiples reclamos de pasajeros");
    }

    let level: "low" | "medium" | "high" | "blocked" = "low";
    if (isHardBlocked || score >= 86) {
        level = "blocked";
    } else if (score >= 61) {
        level = "high";
    } else if (score >= 31) {
        level = "medium";
    }

    return { level, reasons, score };
}

// Initialize Admin
const serviceAccountPath = join(process.cwd(), 'firebase-adminsdk.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function main() {
    const confirm = process.argv.includes('--confirm');
    console.log(`[DRIVER_FINANCIAL_UNLOCK_CHECK] Starting repair script...`);
    console.log(`Mode: ${confirm ? 'EXECUTE (CONFIRM)' : 'DRY-RUN'}`);
    console.log(`--------------------------------------------------`);

    const driversSnap = await db.collection('users')
        .where('role', '==', 'driver')
        .get();

    let totalChecked = 0;
    let totalUnlocked = 0;
    let totalRemainedBlocked = 0;

    for (const doc of driversSnap.docs) {
        const driver = doc.data();
        const uid = doc.id;
        
        // Only process if they are currently blocked or have debt reasons
        const wasBlocked = driver.driverRiskLevel === 'blocked';
        const hadDebtReason = driver.riskReasons?.some((r: string) => r.includes('deuda') || r.includes('Saldo'));
        
        if (!wasBlocked && !hadDebtReason) continue;

        totalChecked++;

        // Get latest wallet balance and user balance
        const walletSnap = await db.collection('wallets').doc(uid).get();
        const walletData = walletSnap.exists ? walletSnap.data() : null;
        const walletBalance = walletData?.cashBalance || 0;
        const userBalance = driver.currentBalance || 0;

        // Desync detection logic
        let balance = walletBalance;
        let needsSync = false;

        const walletUpdateTs = walletData?.updatedAt?.toMillis() || 0;
        const userUpdateTs = driver.updatedAt?.toMillis() || 0;

        if (userBalance !== walletBalance && userUpdateTs > walletUpdateTs && userBalance >= 0) {
            console.log(`[DESYNC_DETECTED] Driver: ${uid} | User balance (${userBalance}) is newer and positive compared to Wallet (${walletBalance}). Using User balance.`);
            balance = userBalance;
            needsSync = true;
        }

        const risk = computeRiskLevel(driver, balance);

        if (wasBlocked && risk.level !== 'blocked') {
            console.log(`[UNLOCKABLE] Driver: ${uid} | Name: ${driver.name} | Balance: ${balance} | Prev Level: ${driver.driverRiskLevel} | New Level: ${risk.level}`);
            console.log(`   Reasons removed: ${driver.riskReasons?.filter((r: string) => !risk.reasons.includes(r)).join(', ') || 'none'}`);
            console.log(`   Remaining reasons: ${risk.reasons.join(', ') || 'none'}`);
            
            if (confirm) {
                const batch = db.batch();
                batch.update(db.collection('users').doc(uid), {
                    driverRiskLevel: risk.level,
                    driverRiskScore: Math.min(100, risk.score),
                    riskReasons: risk.reasons,
                    currentBalance: balance,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const walletRef = db.collection('wallets').doc(uid);
                if (walletSnap.exists) {
                    batch.update(walletRef, {
                        cashBalance: balance,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    batch.set(walletRef, {
                        userId: uid,
                        cashBalance: balance,
                        promoBalance: 0,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                const locRef = db.collection('drivers_locations').doc(uid);
                const locSnap = await locRef.get();
                if (locSnap.exists) {
                    batch.update(locRef, {
                        driverRiskLevel: risk.level,
                        driverRiskScore: Math.min(100, risk.score),
                        walletBalance: balance,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                await batch.commit();
                console.log(`   ✅ SUCCESS: Driver unlocked and synced.`);
            }
            totalUnlocked++;
        } else if (needsSync && confirm) {
             // If they don't get unlocked but we detected a newer balance, we should still sync the wallet
             console.log(`[SYNC_ONLY] Driver: ${uid} | Syncing wallet with newer user balance ${balance}`);
             await db.collection('wallets').doc(uid).set({ cashBalance: balance, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } else if (wasBlocked && risk.level === 'blocked') {
            console.log(`[STAY_BLOCKED] Driver: ${uid} | Name: ${driver.name} | Balance: ${balance} | Reasons: ${risk.reasons.join(', ')}`);
            totalRemainedBlocked++;
        }
    }

    console.log(`--------------------------------------------------`);
    console.log(`REPARACIÓN FINALIZADA`);
    console.log(`- Conductores analizados: ${totalChecked}`);
    console.log(`- Conductores desbloqueados: ${totalUnlocked}`);
    console.log(`- Conductores que siguen bloqueados: ${totalRemainedBlocked}`);
    
    if (!confirm && totalUnlocked > 0) {
        console.log(`\n¡AVISO! Se encontraron ${totalUnlocked} conductores que pueden ser desbloqueados.`);
        console.log(`Ejecutá con --confirm para aplicar los cambios.`);
    }
}

main().catch(err => {
    console.error(`[FATAL] Error en el script:`, err);
    process.exit(1);
});
