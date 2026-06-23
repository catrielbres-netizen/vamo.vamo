import admin from 'firebase-admin';

try {
    admin.initializeApp({ projectId: "studio-6697160840-7c67f" });
} catch (e) {}

const db = admin.firestore();

async function runCleanup() {
    const isDryRun = process.argv.includes('--dry-run');

    console.log("=====================================================");
    console.log(`🧹 LIMPIEZA STALE MASTER RIDES (VamO Compartido)`);
    console.log(`Modo: ${isDryRun ? "DRY-RUN (Solo Análisis)" : "EXECUTE (Limpieza Real)"}`);
    console.log("=====================================================\n");

    try {
        const usersSnap = await db.collection('users').get();
        const activeUsers = new Map<string, any>();

        usersSnap.forEach(doc => {
            const u = doc.data();
            if (u.activeRideId || u.activeSharedGroupId || u.activeSharedRequestId) {
                activeUsers.set(doc.id, u);
            }
        });

        // 1. Identificar Master Rides Activos
        console.log("=== 1. ANALIZANDO RIDES MAESTROS ACTIVOS ===");
        const ridesSnap = await db.collection('rides')
            .where('isSharedRide', '==', true)
            .where('status', 'in', ['driver_assigned', 'driver_arrived', 'in_progress'])
            .get();

        const staleRides: any[] = [];

        ridesSnap.forEach(doc => {
            const ride = doc.data();
            if (ride.isSharedChildRide) return;

            let usersPointingHere = 0;
            const usersList: string[] = [];

            activeUsers.forEach((u, uid) => {
                if (u.activeRideId === doc.id || u.activeSharedRideId === doc.id || u.activeSharedGroupId === ride.sharedGroupId) {
                    usersPointingHere++;
                    usersList.push(uid);
                }
            });

            console.log(`\nRide Maestro: ${doc.id}`);
            console.log(`- status: ${ride.status}`);
            console.log(`- isSharedRide: ${ride.isSharedRide}`);
            console.log(`- isSharedChildRide: ${ride.isSharedChildRide || false}`);
            console.log(`- sharedGroupId: ${ride.sharedGroupId}`);
            console.log(`- driverId: ${ride.driverId}`);
            console.log(`- passengerId (si existe): ${ride.passengerId || 'N/A'}`);
            console.log(`- sharedPassengers:`, ride.sharedPassengers);
            console.log(`- createdAt: ${ride.createdAt ? ride.createdAt.toDate().toISOString() : 'N/A'}`);
            console.log(`- updatedAt: ${ride.updatedAt ? ride.updatedAt.toDate().toISOString() : 'N/A'}`);
            console.log(`- Usuarios apuntando aquí: ${usersPointingHere} (${usersList.join(', ')})`);
            
            // Evaluaciones de seguridad
            let safeToClean = true;
            if (ride.paymentStatus === 'approved') {
                console.log(`[ALERTA] Este ride tiene paymentStatus=approved. PELIGRO DE DINERO REAL.`);
                safeToClean = false;
            }
            if (ride.paymentMethod === 'mercadopago' && ride.mercadoPagoId) {
                console.log(`[ALERTA] Este ride tiene Mercado Pago asociado. PELIGRO DE DINERO REAL.`);
                safeToClean = false;
            }

            if (safeToClean) {
                staleRides.push({
                    id: doc.id,
                    groupId: ride.sharedGroupId,
                    driverId: ride.driverId,
                    usersList
                });
            }
        });

        // 2. Identificar Usuarios Colgados
        console.log("\n=== 2. ANALIZANDO USUARIOS CON PUNTEROS COLGADOS ===");
        const staleUsers: any[] = [];

        for (const [uid, u] of activeUsers.entries()) {
            // Buscamos a los que apuntan a cosas compartidas
            if (u.activeSharedGroupId || u.activeSharedRequestId || u.activeSharedRideId || (u.activeRideId && !u.activeRideId.startsWith('shared_child') && u.sharedRideStatus)) {
                
                console.log(`\nUsuario: ${uid}`);
                console.log(`- Nombre/Email: ${u.firstName || u.name || ''} / ${u.email || ''}`);
                console.log(`- activeRideId: ${u.activeRideId}`);
                console.log(`- activeSharedRideId: ${u.activeSharedRideId}`);
                console.log(`- activeSharedGroupId: ${u.activeSharedGroupId}`);
                console.log(`- activeSharedRequestId: ${u.activeSharedRequestId}`);

                // Validar a qué apuntan
                let targetStatus = 'unknown';
                if (u.activeRideId) {
                    const rSnap = await db.collection('rides').doc(u.activeRideId).get();
                    if (rSnap.exists) {
                        targetStatus = rSnap.data()?.status || 'unknown';
                    } else {
                        targetStatus = 'inexistente';
                    }
                    console.log(`-> El ride al que apunta está: ${targetStatus}`);
                }

                if (u.activeSharedGroupId) {
                    const gSnap = await db.collection('shared_ride_groups').doc(u.activeSharedGroupId).get();
                    if (gSnap.exists) {
                        console.log(`-> El grupo al que apunta está: ${gSnap.data()?.status}`);
                    } else {
                        console.log(`-> El grupo al que apunta NO existe`);
                    }
                }

                if (targetStatus === 'inexistente' || targetStatus === 'cancelled' || targetStatus === 'completed' || staleRides.find(r => r.id === u.activeRideId)) {
                    staleUsers.push({
                        uid,
                        activeRideId: u.activeRideId,
                        activeSharedRideId: u.activeSharedRideId,
                        activeSharedGroupId: u.activeSharedGroupId,
                        activeSharedRequestId: u.activeSharedRequestId
                    });
                } else {
                    console.log(`[ALERTA] El usuario apunta a un viaje activo real diferente a los estancados. NO LIMPIAR.`);
                }
            }
        }


        // 3. Resumen y Limpieza
        console.log("\n=== 3. RESUMEN Y PLAN DE ACCIÓN ===");
        if (staleRides.length === 0 && staleUsers.length === 0) {
            console.log("No hay nada que limpiar bajo estas reglas.");
            return;
        }

        console.log(`Se identificaros ${staleRides.length} Master Rides estancados seguros para limpiar.`);
        console.log(`Se identificaron ${staleUsers.length} Usuarios con punteros colgados listos para limpiar.`);

        if (isDryRun) {
            console.log("\n[DRY-RUN] Ejecución finalizada. No se modificó ningún dato en producción.");
        } else {
            console.log("\n[EXECUTE] INICIANDO LIMPIEZA...");
            
            const batch = db.batch();
            const now = admin.firestore.FieldValue.serverTimestamp();

            for (const ride of staleRides) {
                // Cancelar Ride
                batch.update(db.collection('rides').doc(ride.id), {
                    status: 'cancelled',
                    cancellationReason: 'manual_alpha_cleanup_stale_master',
                    cancelledBy: 'admin_manual_cleanup',
                    cancelledAt: now,
                    closedAt: now
                });

                // Cancelar Grupo
                if (ride.groupId) {
                    const groupRef = db.collection('shared_ride_groups').doc(ride.groupId);
                    const gSnap = await groupRef.get();
                    if (gSnap.exists) {
                        batch.update(groupRef, {
                            status: 'cancelled',
                            cancellationReason: 'manual_alpha_cleanup_stale_master',
                            cancelledAt: now,
                            closedAt: now
                        });
                    }
                }

                // Cancelar Offers
                const offersSnap = await db.collection('rideOffers').where('rideId', '==', ride.id).where('status', 'in', ['pending', 'accepted']).get();
                offersSnap.forEach(off => {
                    batch.update(off.ref, {
                        status: 'cancelled',
                        cancellationReason: 'manual_alpha_cleanup_stale_master'
                    });
                });

                // Limpiar conductor si su currentRideId coincide
                if (ride.driverId) {
                    const dSnap = await db.collection('users').doc(ride.driverId).get();
                    if (dSnap.exists) {
                        const dData = dSnap.data();
                        if (dData?.activeRideId === ride.id || dData?.currentRideId === ride.id) {
                            batch.update(dSnap.ref, {
                                activeRideId: admin.firestore.FieldValue.delete(),
                                currentRideId: admin.firestore.FieldValue.delete(),
                                driverStatus: 'online',
                                status: dData.status === 'in_ride' ? 'online' : dData?.status,
                                isAvailable: true,
                                updatedAt: now
                            });
                        }
                    }
                }
            }

            for (const u of staleUsers) {
                const uUpdates: any = { updatedAt: now };
                
                if (u.activeRideId && staleRides.find(r => r.id === u.activeRideId)) {
                    uUpdates.activeRideId = admin.firestore.FieldValue.delete();
                } else if (u.activeRideId && !u.activeRideId.startsWith('shared_child')) {
                     // Solo borramos el puntero si apunta a un viaje que vamos a matar o q ya no existe
                     uUpdates.activeRideId = admin.firestore.FieldValue.delete();
                }

                uUpdates.activeSharedRideId = admin.firestore.FieldValue.delete();
                uUpdates.activeSharedGroupId = admin.firestore.FieldValue.delete();
                uUpdates.activeSharedRequestId = admin.firestore.FieldValue.delete();
                uUpdates.sharedRideStatus = admin.firestore.FieldValue.delete();

                batch.update(db.collection('users').doc(u.uid), uUpdates);

                // Cancelar Shared Request si existía
                if (u.activeSharedRequestId) {
                    const reqRef = db.collection('shared_ride_requests').doc(u.activeSharedRequestId);
                    const reqSnap = await reqRef.get();
                    if (reqSnap.exists) {
                        batch.update(reqRef, {
                            status: 'cancelled',
                            active: false,
                            cancellationReason: 'manual_alpha_cleanup_stale_master',
                            updatedAt: now
                        });
                    }
                }
            }

            await batch.commit();
            console.log("\n[EXECUTE] Limpieza de Rides y Punteros completada con éxito.");
        }

    } catch (e) {
        console.error("Error durante limpieza:", e);
    }
}

runCleanup().then(() => process.exit(0));
