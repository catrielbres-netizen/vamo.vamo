import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDb } from "./lib/firebaseAdmin";
import { buildTrafficDriverViewModel, getDriverOperationalStatus } from "./lib/traffic";
import * as nodemailer from "nodemailer";

function jsonToCsv(items: any[]) {
    if (!items || !items.length) return "";
    const replacer = (key: string, value: any) => value === null ? '' : value; 
    const header = Object.keys(items[0]);
    const csv = [
      header.join(','),
      ...items.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
    ].join('\r\n');
    return csv;
}

export const generateTrafficDriversReportV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { cityKey, filter = 'all' } = request.data;
    if (!cityKey) throw new HttpsError('invalid-argument', 'cityKey es requerido');

    const db = getDb();
    
    // Fetch all drivers for the city
    const usersSnap = await db.collection('users')
        .where('role', '==', 'driver')
        .where('cityKey', '==', cityKey)
        .get();

    // Fetch active locations
    const locationsSnap = await db.collection('drivers_locations')
        .where('cityKey', '==', cityKey)
        .get();
    
    const locationsMap = new Map();
    locationsSnap.docs.forEach(d => locationsMap.set(d.id, d.data()));

    // Fetch active rides
    const ridesSnap = await db.collection('rides')
        .where('cityKey', '==', cityKey)
        .where('status', 'in', ['searching', 'assigned', 'in_progress'])
        .get();
    const ridesMap = new Map();
    ridesSnap.docs.forEach(d => {
        const r = d.data();
        if (r.driverId) ridesMap.set(r.driverId, r);
    });

    const dataset = [];
    const summary = {
        total: 0,
        enabled: 0,
        pending: 0,
        observed: 0,
        suspended: 0,
        missingDocs: 0,
        expiredDocs: 0,
        online: 0,
        inRide: 0
    };

    for (const doc of usersSnap.docs) {
        const u = doc.data();
        const loc = locationsMap.get(u.id);
        const ride = ridesMap.get(u.id);
        
        const vm = buildTrafficDriverViewModel(u, null, null, loc, ride);
        
        // Apply basic filter
        if (filter === 'online' && vm.liveStatus !== 'online') continue;
        if (filter === 'suspended' && vm.operationalStatus !== 'suspended') continue;
        if (filter === 'observed' && vm.operationalStatus !== 'observed') continue;

        dataset.push({
            id: vm.driverId,
            name: vm.displayName,
            operationalStatus: vm.operationalStatus,
            municipalStatus: vm.municipalStatus,
            liveStatus: vm.liveStatus,
            vehicle: `${vm.vehicleBrand} ${vm.vehicleModel}`,
            plate: vm.plate,
            observations: '-' // Computed elsewhere if needed
        });

        summary.total++;
        if (vm.operationalStatus === 'enabled') summary.enabled++;
        if (vm.operationalStatus === 'pending') summary.pending++;
        if (vm.operationalStatus === 'observed') summary.observed++;
        if (vm.operationalStatus === 'suspended') summary.suspended++;
        if (vm.liveStatus === 'online') summary.online++;
        if (vm.liveStatus === 'in_ride') summary.inRide++;
    }

    const csvData = jsonToCsv(dataset);
    const base64Csv = Buffer.from(csvData).toString('base64');

    return {
        summary,
        dataset,
        csvBase64: base64Csv
    };
});

export const sendTrafficDriversReportEmailV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { cityKey, recipients, subject, body, csvBase64 } = request.data;

    const db = getDb();

    // Log the intent
    await db.collection('traffic_report_emails').add({
        cityKey,
        generatedBy: request.auth.uid,
        recipients,
        subject,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending_email_provider'
    });

    try {
        // If nodemailer transport is configured in environment, send it here.
        // For now, simulate success
        console.log(`[EMAIL_SIMULATION] Sending report to ${recipients.join(', ')}`);
        console.log(`[EMAIL_SIMULATION] Subject: ${subject}`);
        console.log(`[EMAIL_SIMULATION] Attachments: 1 CSV (base64 size: ${csvBase64?.length})`);
        
        return { success: true, message: 'Email encolado / enviado simulado exitosamente.' };
    } catch (error) {
        console.error(error);
        throw new HttpsError('internal', 'Error enviando email.');
    }
});
