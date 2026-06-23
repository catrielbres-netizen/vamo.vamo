const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

function getWeekIdForDate(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function run() {
    const now = new Date();
    const prevDate = new Date();
    prevDate.setDate(now.getDate() - 7);
    
    // In Vamo.vamo, week logic is custom (using local time logic). Let's just query ALL driver points to find the weeks.
    console.log("Checking last 50 driver_points...");
    
    const pointsSnap = await db.collection('driver_points').orderBy('updatedAt', 'desc').limit(20).get();
    const weeks = new Set();
    pointsSnap.forEach(doc => {
        const data = doc.data();
        console.log(`Driver: ${doc.id}, Week: ${data.weekId}, City: ${data.cityKey}, Points: ${data.points}, Trips: ${data.weeklyTripsCount}`);
        if (data.weekId) weeks.add(data.weekId);
    });
    
    console.log(`\nFound weeks:`, Array.from(weeks));
    
    for (const week of weeks) {
        console.log(`\n--- WEEK: ${week} ---`);
        const dists = await db.collection('weekly_pool_distributions').where('weekId', '==', week).get();
        console.log(`Found ${dists.size} distributions for week ${week}.`);
        dists.forEach(d => console.log(`  - ${d.id}: Driver ${d.data().driverId}, Amount: ${d.data().amountPaid}`));
        
        const rawsonPool = await db.collection('cities').doc('rawson').collection('weekly_pools').doc(week).get();
        if (rawsonPool.exists) {
            console.log(`Rawson Pool:`, rawsonPool.data());
        } else {
            console.log(`Rawson Pool not found.`);
        }
    }
}

run().then(() => process.exit(0)).catch(console.error);
