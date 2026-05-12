import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const PROJECT_ID = "studio-6697160840-7c67f";
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();

async function exportReport() {
    console.log("--- VamO Anti-Fraud Audit Report Generator ---");

    // 1. Parse Arguments
    const args = process.argv.slice(2);
    const cityKeyArg = args.find(a => a.startsWith('--cityKey='))?.split('=')[1];
    const daysArg = Number(args.find(a => a.startsWith('--days='))?.split('=')[1]) || 7;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysArg);
    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);

    console.log(`Filters: cityKey=${cityKeyArg || 'ALL'}, days=${daysArg} (since ${startDate.toISOString()})`);

    // 2. Fetch Data
    console.log("Fetching fraud alerts...");
    let alertsQuery = db.collection('fraud_alerts').where('createdAt', '>=', startTimestamp);
    if (cityKeyArg) alertsQuery = alertsQuery.where('cityKey', '==', cityKeyArg);
    const alertsSnap = await alertsQuery.get();
    const alerts = alertsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    console.log("Fetching passenger lifecycle...");
    let passengerQuery = db.collection('passenger_lifecycle');
    if (cityKeyArg) passengerQuery = passengerQuery.where('cityKey', '==', cityKeyArg);
    const passengerSnap = await passengerQuery.get();
    const passengerMarks = passengerSnap.docs.map(d => d.data());

    console.log("Fetching ledger events...");
    let ledgerQuery = db.collection('ledger_events').where('timestamp', '>=', startTimestamp);
    if (cityKeyArg) ledgerQuery = ledgerQuery.where('cityKey', '==', cityKeyArg);
    const ledgerSnap = await ledgerQuery.get();
    const ledger = ledgerSnap.docs.map(d => d.data());

    // 3. Generate CSV: Fraud Alerts
    console.log("Generating CSVs...");
    const alertsCsv = [
        "alertId,type,severity,score,rideId,passengerId,driverId,cityKey,reason,status,createdAt",
        ...alerts.map((a: any) => [
            a.id, a.type, a.severity, a.score, a.rideId, a.passengerId, a.driverId, a.cityKey, 
            `"${(a.reason || "").replace(/"/g, '""')}"`, a.status, a.createdAt?.toDate().toISOString()
        ].join(","))
    ].join("\n");

    // 4. Generate CSV: Passenger Trust
    const passengerCsv = [
        "passengerId,totalMarks,lastMarkType,trustScore,cityKey",
        ...passengerMarks.map((p: any) => [
            p.passengerId, p.totalDriverMarks, p.lastDriverMarkType || "none", p.trustScore, p.cityKey
        ].join(","))
    ].join("\n");

    // 5. Generate Executive Summary
    const summary = {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter((a: any) => a.score >= 80).length,
        highAlerts: alerts.filter((a: any) => a.score >= 60 && a.score < 80).length,
        alertsByType: alerts.reduce((acc: any, a: any) => {
            acc[a.type] = (acc[a.type] || 0) + 1;
            return acc;
        }, {}),
        topSuspectDrivers: getTopEntities(alerts, 'driverId'),
        topSuspectPassengers: getTopEntities(alerts, 'passengerId')
    };

    const summaryText = `--- EXECUTIVE SUMMARY ---
Generated At: ${new Date().toISOString()}
Total Alerts: ${summary.totalAlerts}
Critical Alerts (>=80): ${summary.criticalAlerts}
High Alerts (60-79): ${summary.highAlerts}

Alerts By Type:
${Object.entries(summary.alertsByType).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}

Top Suspect Drivers:
${summary.topSuspectDrivers.map(e => `  - ${e.id}: ${e.count} alerts`).join("\n")}

Top Suspect Passengers:
${summary.topSuspectPassengers.map(e => `  - ${e.id}: ${e.count} alerts`).join("\n")}
`;

    // 6. Write Files
    const outputDir = path.resolve(process.cwd(), 'reports', 'antifraud');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const prefix = `antifraud_${cityKeyArg || 'all'}_${daysArg}d_${Date.now()}`;
    fs.writeFileSync(path.join(outputDir, `${prefix}_alerts.csv`), alertsCsv);
    fs.writeFileSync(path.join(outputDir, `${prefix}_passengers.csv`), passengerCsv);
    fs.writeFileSync(path.join(outputDir, `${prefix}_summary.txt`), summaryText);

    console.log(`\nReport generated successfully in: ${outputDir}`);
    console.log(`Files:\n  - ${prefix}_alerts.csv\n  - ${prefix}_passengers.csv\n  - ${prefix}_summary.txt`);
    console.log("\n" + summaryText);
}

function getTopEntities(data: any[], key: string) {
    const counts = data.reduce((acc: any, item: any) => {
        if (item[key]) acc[item[key]] = (acc[item[key]] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts)
        .map(([id, count]) => ({ id, count: count as number }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

exportReport().catch(console.error);
