import { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { buildMapDriverViewModel } from '@/lib/mapHelpers';

export function useLiveDriversMap(cityKey: string | null) {
    const db = useFirestore();
    const [rawUsers, setRawUsers] = useState<any[]>([]);
    const [rawLocations, setRawLocations] = useState<any[]>([]);
    const [rawProfiles, setRawProfiles] = useState<any[]>([]);
    const [activeRides, setActiveRides] = useState<any[]>([]);

    useEffect(() => {
        if (!db || !cityKey) return;
        
        const qUsers = query(
            collection(db, 'users'),
            where('role', '==', 'driver'),
            where('cityKey', '==', cityKey),
            limit(300)
        );
        const unUsers = onSnapshot(qUsers, snap => setRawUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const qLocs = query(
            collection(db, 'drivers_locations'),
            where('cityKey', '==', cityKey),
            limit(300)
        );
        const unLocs = onSnapshot(qLocs, snap => setRawLocations(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const qProfs = query(
            collection(db, 'public_driver_profiles'),
            where('cityKey', '==', cityKey),
            limit(300)
        );
        const unProfs = onSnapshot(qProfs, snap => setRawProfiles(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const qRides = query(
            collection(db, 'rides'),
            where('cityKey', '==', cityKey),
            where('status', 'in', ['searching', 'offered', 'driver_assigned', 'accepted', 'in_progress'])
        );
        const unRides = onSnapshot(qRides, snap => setActiveRides(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        return () => {
            unUsers();
            unLocs();
            unProfs();
            unRides();
        };
    }, [db, cityKey]);

    const driversData = useMemo(() => {
        const locationCounts: Record<string, number> = {};
        
        // Unimos por ID de usuario. A veces existe location pero no user, lo manejamos.
        const allIds = new Set([
            ...rawUsers.map(u => u.id),
            ...rawLocations.map(l => l.id)
        ]);

        const unified = Array.from(allIds).map(id => {
            const user = rawUsers.find(u => u.id === id);
            const loc = rawLocations.find(l => l.id === id);
            const prof = rawProfiles.find(p => p.id === id);
            const ride = activeRides.find(r => r.driverId === id);

            // If we only have location but no user doc, we can still construct
            const baseUser = user || { id, driverStatus: loc?.driverStatus || 'offline', cityKey };

            const vm = buildMapDriverViewModel(baseUser, prof, loc, ride);

            // Debug logic
            const debugInfo = {
                id,
                hasUser: !!user,
                hasLocation: !!loc,
                hasProfile: !!prof,
                userStatus: user?.driverStatus || 'N/A',
                locStatus: loc?.driverStatus || 'N/A',
                userCity: user?.cityKey || 'N/A',
                locCity: loc?.cityKey || 'N/A',
                isOnline: vm.isOnline,
                visibleOnMap: vm.visibleOnMap,
                visibleInSideList: vm.visibleInSideList,
                discardReason: (!vm.visibleOnMap && !vm.visibleInSideList) ? 'Offline and no ride' : 'None',
                lat: vm.location?.lat || 'missing',
                lng: vm.location?.lng || 'missing'
            };

            // Jitter for overlapping markers
            if (vm.location) {
                const key = `${vm.location.lat.toFixed(4)},${vm.location.lng.toFixed(4)}`;
                const count = locationCounts[key] || 0;
                locationCounts[key] = count + 1;

                if (count > 0) {
                    const offsetLat = (count % 2 === 0 ? 1 : -1) * Math.ceil(count / 2) * 0.00015;
                    const offsetLng = (count % 3 === 0 ? 1 : -1) * Math.ceil(count / 2) * 0.00015;
                    vm.location.lat += offsetLat;
                    vm.location.lng += offsetLng;
                }
            }

            return { ...vm, _debug: debugInfo };
        });

        const filtered = unified.filter(d => d.visibleInSideList || d.visibleOnMap);

        return { unified, filtered };
    }, [rawUsers, rawLocations, rawProfiles, activeRides]);

    return { 
        drivers: driversData.filtered, 
        activeRides, 
        debugDrivers: driversData.unified,
        rawCounts: {
            users: rawUsers.length,
            locations: rawLocations.length,
            profiles: rawProfiles.length,
            rides: activeRides.length
        }
    };
}
