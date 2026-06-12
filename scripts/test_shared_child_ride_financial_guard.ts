import admin from 'firebase-admin';

try {
    admin.initializeApp({ projectId: "studio-6697160840-7c67f" });
} catch(e) {}

const db = admin.firestore();

async function testGuard() {
    console.log("==========================================");
    console.log("Prueba de Guarda Financiera - Child Rides");
    console.log("==========================================");

    const childRidesSnap = await db.collection('rides')
                                   .where('isSharedChildRide', '==', true)
                                   .limit(10)
                                   .get();

    if (childRidesSnap.empty) {
        console.log("No hay Child Rides en la base de datos para auditar.");
        return;
    }

    let allSafe = true;

    childRidesSnap.forEach(doc => {
        const data = doc.data();
        console.log(`\nRevisando Child Ride: ${doc.id}`);
        console.log(`- isSharedChildRide: ${data.isSharedChildRide}`);
        console.log(`- countsForWeeklyPot: ${data.countsForWeeklyPot}`);
        console.log(`- preventDuplicateFinancialLedger: ${data.preventDuplicateFinancialLedger}`);
        
        let safe = true;
        
        if (!data.isSharedChildRide) {
            console.error("  [ERROR] isSharedChildRide es falso o no existe.");
            safe = false;
        }
        
        if (data.walletMovements && data.walletMovements.length > 0) {
            console.error("  [CRITICAL ERROR] El Child Ride tiene walletMovements! Esto duplica cobros.");
            safe = false;
        }

        if (data.financialStatus === 'settled' && !data.preventDuplicateFinancialLedger) {
            console.error("  [CRITICAL ERROR] Se hizo settlement sin la protección de ledger.");
            safe = false;
        }

        if (safe) {
            console.log("  [OK] El Child Ride está protegido. NO duplica dinero. SÍ suma pozo.");
        } else {
            allSafe = false;
        }
    });

    if (allSafe) {
        console.log("\n[SUCCESS] Todos los Child Rides analizados superan la guarda financiera.");
    } else {
        console.log("\n[FAIL] Algunos Child Rides fallaron las guardas financieras.");
    }
}

testGuard().then(() => process.exit(0));
