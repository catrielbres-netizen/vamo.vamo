"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
async function checkRecentRides() {
    console.log("Checking last 5 rides...");
    const snap = await db.collection('rides').orderBy('createdAt', 'desc').limit(5).get();
    if (snap.empty) {
        console.log("No rides found in collection 'rides'");
    }
    else {
        snap.forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id} | Status: ${data.status} | Created: ${data.createdAt?.toDate().toISOString()} | Passenger: ${data.passengerId}`);
            if (data.origin) {
                console.log(`   Origin: ${data.origin.address} (${data.origin.lat}, ${data.origin.lng})`);
            }
        });
    }
    console.log("\nChecking online drivers in drivers_locations...");
    const driversSnap = await db.collection('drivers_locations').where('driverStatus', '==', 'online').get();
    console.log(`Found ${driversSnap.size} online drivers.`);
    driversSnap.forEach(doc => {
        const d = doc.data();
        console.log(`Driver: ${doc.id} | Status: ${d.driverStatus} | LastSeen: ${d.lastSeenAt?.toDate().toISOString()}`);
    });
}
checkRecentRides().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
//# sourceMappingURL=check_db.js.map