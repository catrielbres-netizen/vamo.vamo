import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const PROJECT_ID = "studio-6697160840-7c67f"; 
const SERVICE_ACCOUNT_PATH = "C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json";

if (admin.apps.length === 0) {
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        console.log(`🔑 Using service account from: ${SERVICE_ACCOUNT_PATH}`);
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))),
            projectId: PROJECT_ID
        });
    } else {
        console.log(`⚠️ Service account not found at ${SERVICE_ACCOUNT_PATH}, using project ID only.`);
        admin.initializeApp({ projectId: PROJECT_ID });
    }
}
const db = admin.firestore();

async function exportAuditLedger() {
    console.log("\n====================================================");
    console.log("🚀 VamO Audit Ledger Export Utility (CSV Edition)");
    console.log("====================================================\n");

    // 1. Parse Arguments
    const args = process.argv.slice(2);
    const cityKeyArg = args.find(a => a.startsWith('--cityKey='))?.split('=')[1];
    const daysArg = Number(args.find(a => a.startsWith('--days='))?.split('=')[1]) || 30;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysArg);
    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);

    console.log(`📍 Scope: ${cityKeyArg ? cityKeyArg.toUpperCase() : 'ALL CITIES'}`);
    console.log(`📅 Period: last ${daysArg} days (since ${startDate.toLocaleDateString()})`);

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `ledger_export_${cityKeyArg || 'global'}_${timestampStr}`;
    const outputDir = path.resolve(process.cwd(), 'reports', folderName);
    
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Helper to generate CSV
    const saveCsv = (name: string, headers: string[], data: any[][]) => {
        const content = [
            headers.join(","),
            ...data.map(row => row.map(val => {
                if (val === undefined || val === null) return '""';
                const str = String(val).replace(/"/g, '""');
                return `"${str}"`;
            }).join(","))
        ].join("\n");
        fs.writeFileSync(path.join(outputDir, `${name}.csv`), content);
        console.log(`✅ [EXPORTED] ${name}.csv (${data.length} rows)`);
    };

    // --- SECTIONS ---

    // 1. Conductores
    console.log("Fetching drivers...");
    let driversQuery: any = db.collection('users').where('role', '==', 'driver');
    if (cityKeyArg) driversQuery = driversQuery.where('cityKey', '==', cityKeyArg);
    const driversSnap = await driversQuery.get();
    saveCsv("01_conductores", 
        ["uid", "name", "email", "phone", "cityKey", "subtype", "approved", "muniStatus", "balance", "createdAt"],
        driversSnap.docs.map(d => {
            const v = d.data();
            return [d.id, v.name, v.email, v.phone, v.cityKey, v.driverSubtype, v.approved, v.municipalStatus, v.currentBalance, v.createdAt?.toDate?.()?.toISOString() || v.createdAt];
        })
    );

    // 2. Pasajeros
    console.log("Fetching passengers...");
    let passengersQuery: any = db.collection('users').where('role', '==', 'passenger');
    if (cityKeyArg) passengersQuery = passengersQuery.where('cityKey', '==', cityKeyArg);
    const passengersSnap = await passengersQuery.get();
    saveCsv("02_pasajeros",
        ["uid", "name", "email", "phone", "cityKey", "totalRides", "trustScore", "createdAt"],
        passengersSnap.docs.map(d => {
            const v = d.data();
            return [d.id, v.name, v.email, v.phone, v.cityKey, v.passengerStats?.totalRides || 0, v.trustScore || 100, v.createdAt?.toDate?.()?.toISOString() || v.createdAt];
        })
    );

    // 3. Viajes
    console.log("Fetching rides...");
    let ridesQuery: any = db.collection('rides').where('createdAt', '>=', startTimestamp);
    // Removed cityKey where to avoid index issues, filtering in memory
    const ridesSnap = await ridesQuery.get();
    const ridesData = ridesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !cityKeyArg || v.cityKey === cityKeyArg);

    saveCsv("03_viajes",
        ["rideId", "status", "passengerId", "driverId", "cityKey", "serviceType", "totalFare", "commission", "muniFee", "createdAt", "completedAt"],
        ridesData.map((v: any) => [v.id, v.status, v.passengerId, v.driverId, v.cityKey, v.serviceType, v.completedRide?.totalFare || 0, v.completedRide?.commissionAmount || 0, v.completedRide?.municipalFee || 0, v.createdAt?.toDate?.()?.toISOString() || v.createdAt, v.completedAt?.toDate?.()?.toISOString() || v.completedAt])
    );

    // 4. Reclamos
    console.log("Fetching claims...");
    let claimsQuery: any = db.collection('fap_claims').where('createdAt', '>=', startTimestamp);
    const claimsSnap = await claimsQuery.get();
    const claimsData = claimsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !cityKeyArg || v.cityKey === cityKeyArg);

    saveCsv("04_reclamos",
        ["claimId", "caseId", "rideId", "passengerId", "driverId", "type", "status", "requestedAmount", "createdAt"],
        claimsData.map((v: any) => [v.id, v.caseId, v.rideId, v.passengerId, v.driverId, v.type, v.status, v.requestedAmount, v.createdAt?.toDate?.()?.toISOString() || v.createdAt])
    );

    // 5. Alertas Antifraude
    console.log("Fetching fraud alerts...");
    let fraudQuery: any = db.collection('fraud_alerts').where('createdAt', '>=', startTimestamp);
    const fraudSnap = await fraudQuery.get();
    const fraudData = fraudSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !cityKeyArg || v.cityKey === cityKeyArg);

    saveCsv("05_alertas_antifraude",
        ["alertId", "type", "severity", "score", "rideId", "passengerId", "driverId", "status", "reason", "createdAt"],
        fraudData.map((v: any) => [v.id, v.type, v.severity, v.score, v.rideId, v.passengerId, v.driverId, v.status, v.reason, v.createdAt?.toDate?.()?.toISOString() || v.createdAt])
    );

    // 6. Wallets (Platform Transactions)
    console.log("Fetching platform transactions...");
    let txQuery: any = db.collection('platform_transactions').where('createdAt', '>=', startTimestamp);
    const txSnap = await txQuery.get();
    const txData = txSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !cityKeyArg || v.cityKey === cityKeyArg);

    saveCsv("06_transacciones_wallet",
        ["txId", "type", "amount", "driverId", "cityKey", "rideId", "description", "createdAt"],
        txData.map((v: any) => [v.id, v.type, v.amount, v.driverId, v.cityKey, v.rideId, v.description, v.createdAt?.toDate?.()?.toISOString() || v.createdAt])
    );

    // 7. Pozo Semanal
    console.log("Fetching weekly pool info...");
    const citiesSnap = await db.collection('cities').get();
    saveCsv("07_pozo_semanal",
        ["cityKey", "cityName", "currentPool", "nextReset"],
        citiesSnap.docs.map(d => {
            const v = d.data();
            if (cityKeyArg && d.id !== cityKeyArg) return null;
            return [d.id, v.name, v.rewardsConfig?.weeklyPoolAmount || 0, v.rewardsConfig?.nextResetAt?.toDate?.()?.toISOString() || v.rewardsConfig?.nextResetAt];
        }).filter(x => x !== null) as any[][]
    );

    // 8. Municipalidades
    console.log("Fetching municipalities...");
    saveCsv("08_municipalidades",
        ["cityKey", "name", "province", "status", "adminUserId", "pricingVersion"],
        citiesSnap.docs.map(d => {
            const v = d.data();
            if (cityKeyArg && d.id !== cityKeyArg) return null;
            return [d.id, v.name, v.province, v.status, v.adminUserId, v.pricingVersion];
        }).filter(x => x !== null) as any[][]
    );

    // 9. Eventos Operativos
    console.log("Fetching audit logs...");
    let auditQuery: any = db.collection('audit_logs').where('timestamp', '>=', startTimestamp);
    const auditSnap = await auditQuery.get();
    const auditData = auditSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !cityKeyArg || v.cityKey === cityKeyArg);

    saveCsv("09_eventos_operativos",
        ["logId", "eventType", "actorId", "targetId", "cityKey", "metadata", "timestamp"],
        auditData.map((v: any) => [v.id, v.eventType, v.actorId, v.targetId, v.cityKey, JSON.stringify(v.metadata), v.timestamp?.toDate?.()?.toISOString() || v.timestamp])
    );

    // 10. Libro Mayor (Ledger Events)
    console.log("Fetching ledger events...");
    let ledgerQuery: any = db.collection('ledger_events').where('timestamp', '>=', startTimestamp);
    const ledgerSnap = await ledgerQuery.get();
    const ledgerData = ledgerSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !cityKeyArg || v.cityKey === cityKeyArg);

    saveCsv("10_libro_mayor",
        ["eventId", "eventType", "actorId", "targetId", "amount", "cityKey", "rideId", "timestamp"],
        ledgerData.map((v: any) => [v.id, v.eventType, v.actorId, v.targetId, v.amount, v.cityKey, v.rideId, v.timestamp?.toDate?.()?.toISOString() || v.timestamp])
    );

    // 11. Online/Offline Conductores (From driver_lifecycle if it exists)
    console.log("Fetching driver lifecycle (online/offline)...");
    let lifecycleQuery = db.collection('driver_lifecycle').where('timestamp', '>=', startTimestamp);
    // Note: cityKey filtering on lifecycle might require joins or metadata
    const lifecycleSnap = await lifecycleQuery.get();
    saveCsv("11_online_offline_conductores",
        ["logId", "driverId", "action", "cityKey", "timestamp"],
        lifecycleSnap.docs.map(d => {
            const v = d.data();
            if (cityKeyArg && v.cityKey !== cityKeyArg) return null;
            return [d.id, v.driverId, v.action, v.cityKey, v.timestamp?.toDate?.()?.toISOString() || v.timestamp];
        }).filter(x => x !== null) as any[][]
    );

    console.log(`\n====================================================`);
    console.log(`✅ EXPORT COMPLETED: reports/${folderName}`);
    console.log(`====================================================\n`);
}

exportAuditLedger().catch(console.error);
