const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join(__dirname, 'src/app/admin/dashboard/page.tsx'), 'utf8');

const regex = /const baseUserQuery: QueryConstraint\[\] = \[where\('role', '==', 'driver'\)\];[\s\S]*?console.log\("📊 \[ADMIN_STATS_QUERY_ALL_DONE\]"\);/m;

const replacement = `// [VAMO PRO GLOBAL REF] Fetch passengers and drivers fully into memory if global
            let driversSnap, passengersSnap;
            if (isGlobalMode) {
                const qDrivers = query(usersColl, where('role', '==', 'driver'));
                const qPass = query(usersColl, where('role', '==', 'passenger'));
                [driversSnap, passengersSnap] = await Promise.all([getDocs(qDrivers), getDocs(qPass)]);
            } else {
                const qDrivers = query(usersColl, where('role', '==', 'driver'), where('cityKey', '==', activeCityKey));
                const qPass = query(usersColl, where('role', '==', 'passenger'), where('cityKey', '==', activeCityKey));
                [driversSnap, passengersSnap] = await Promise.all([getDocs(qDrivers), getDocs(qPass)]);
            }

            const isTestUser = (data: any) => {
                const email = data.email?.toLowerCase() || '';
                return email.includes('test') || email.includes('demo') || data.isTestUser === true;
            };

            const driversList = driversSnap.docs.map(d => d.data()).filter(d => !isTestUser(d));
            const passengersList = passengersSnap.docs.map(d => d.data()).filter(d => !isTestUser(d));

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            const totalDriversCount = driversList.length;
            const newDriversCount = driversList.filter(d => d.createdAt && (d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt)) >= thirtyDaysAgo).length;
            const blockedDriversCount = driversList.filter(d => d.isSuspended === true).length;
            const approvedCount = driversList.filter(d => d.approved === true).length;
            const onlineCount = driversList.filter(d => d.driverStatus === 'online').length;
            const realPendingCount = driversList.filter(d => isDriverReadyForReview(d)).length;
            const mpLinkedDrivers = driversList.filter(d => d.mpLinked === true).length;
            const mpUnlinkedDrivers = driversList.filter(d => d.mpLinked !== true).length;

            const totalPassengersCount = passengersList.length;
            const newPassengersCount = passengersList.filter(p => p.createdAt && (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)) >= thirtyDaysAgo).length;
            const blockedPassengersCount = passengersList.filter(p => p.isSuspended === true).length;
            
            const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
            const onlinePassengersCount = passengersList.filter(p => {
                if (!p.isOnline || !p.lastActiveAt) return false;
                const d = p.lastActiveAt.toDate ? p.lastActiveAt.toDate() : new Date(p.lastActiveAt);
                return d.getTime() >= twoMinsAgo.getTime();
            }).length;

            const uniqueCities = new Set([
                ...driversList.map(d => d.cityKey).filter(Boolean),
                ...passengersList.map(p => p.cityKey).filter(Boolean)
            ]);
            const citiesWithRecords = uniqueCities.size;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTs = Timestamp.fromDate(today);

            const baseRideQuery: QueryConstraint[] = [];
            const baseWithdrawalQuery: QueryConstraint[] = [where('status', '==', 'pending')];
            if (!isGlobalMode) {
                baseRideQuery.push(where('cityKey', '==', activeCityKey));
                baseWithdrawalQuery.push(where('cityKey', '==', activeCityKey));
            }

            const safeFetch = async (label: string, queryObj: any, isDocs = false) => {
                const logData = { selectedCity: activeCityKey, queryName: label, isGlobalMode, timestamp: new Date().toISOString() };
                try {
                    if (isDocs) {
                        const snap = await getDocs(queryObj);
                        console.log(\`[ADMIN_DASHBOARD_DATA_DEBUG] OK: \${label}\`, { ...logData, resultCount: snap.size });
                        return snap;
                    }
                    const snap = await getCountFromServer(queryObj);
                    const count = snap.data().count;
                    console.log(\`[ADMIN_DASHBOARD_DATA_DEBUG] OK: \${label}\`, { ...logData, resultCount: count });
                    return count;
                } catch (e: any) {
                    console.error(\`[ADMIN_DASHBOARD_DATA_DEBUG] ERROR: \${label}\`, { ...logData, errorCode: e.code || 'unknown', errorMessage: e.message });
                    if (e.message?.includes('index')) {
                        setHasIndexError(true);
                    }
                    return isDocs ? { docs: [] } : 0;
                }
            };

            const [
                withdrawalsCount,
                activeRidesCount,
                completedTodayCount,
                fapNuevos,
                fapPendientes,
                ledgerData,
                totalRidesCount,
                completedRidesCount,
                cancelledRidesCount
            ] = await Promise.all([
                safeFetch('Retiros Pendientes', query(withdrawalsColl, ...baseWithdrawalQuery)),
                safeFetch('Viajes Activos', query(ridesColl, ...baseRideQuery, where('status', 'in', ['searching', 'accepted', 'arrived', 'picked_up']))),
                safeFetch('Viajes Hoy', query(ridesColl, ...baseRideQuery, where('status', '==', 'completed'), where('completedAt', '>=', todayTs))),
                safeFetch('FAP Nuevos', query(collection(firestore, 'fap_claims'), where('status', 'in', ['pending', 'reviewing']), where('adminViewedAt', '==', null))),
                safeFetch('FAP Pendientes', query(collection(firestore, 'fap_claims'), where('status', 'in', ['pending', 'reviewing', 'escalated']))),
                (async () => {
                    try {
                        const metricsColl = collection(firestore, 'city_metrics_hourly');
                        const dayId = \`\${today.getFullYear()}-\${(today.getMonth() + 1).toString().padStart(2, '0')}-\${today.getDate().toString().padStart(2, '0')}\`;
                        let q = query(metricsColl, where('hourId', '>=', \`\${dayId}-00\`), where('hourId', '<=', \`\${dayId}-23\`));
                        if (!isGlobalMode) q = query(q, where('cityKey', '==', activeCityKey));
                        
                        const snap = await getDocs(q);
                        let total = 0, count = 0;
                        snap.docs.forEach(d => {
                            const s = d.data().stats;
                            total += (s.totalGMV || 0);
                            count += (s.completedCount || 0);
                        });
                        return { total, count };
                    } catch (e: any) {
                        return { total: 0, count: 0 };
                    }
                })(),
                safeFetch('Total Viajes', query(ridesColl, ...baseRideQuery)),
                safeFetch('Viajes Completados', query(ridesColl, ...baseRideQuery, where('status', '==', 'completed'))),
                safeFetch('Viajes Cancelados', query(ridesColl, ...baseRideQuery, where('status', '==', 'cancelled')))
            ]);

            console.log("📊 [ADMIN_STATS_QUERY_ALL_DONE]");`;

if (!regex.test(content)) {
    console.error("Regex did not match.");
    process.exit(1);
}

const newContent = content.replace(regex, replacement);
fs.writeFileSync(path.join(__dirname, 'src/app/admin/dashboard/page.tsx'), newContent);
console.log("Replaced successfully!");
