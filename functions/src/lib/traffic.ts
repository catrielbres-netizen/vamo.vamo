export type TrafficOperationalStatus = 'enabled' | 'pending' | 'observed' | 'suspended' | 'offline';

export function getDriverOperationalStatus(
    driver: any, 
    municipalProfile?: any, 
    publicProfile?: any, 
    documents?: any[], 
    trafficObservations?: any[]
): TrafficOperationalStatus {
    if (!driver) return 'pending';

    // 1. Suspendido
    if (
        driver.isSuspended || 
        driver.trafficSuspended || 
        driver.municipalSuspended || 
        driver.adminSuspended || 
        driver.municipalStatus === 'suspended_by_municipality' || 
        driver.municipalStatus === 'suspended_by_traffic' ||
        driver.municipalStatus?.includes('suspended') ||
        driver.municipalStatus === 'rejected_by_municipality'
    ) {
        return 'suspended';
    }

    // 2. Observado
    const hasActiveObs = trafficObservations && trafficObservations.length > 0;
    if (driver.municipalStatus === 'municipal_observed' || hasActiveObs) {
        return 'observed';
    }

    // 3. Habilitado
    const isApprovedLegacy = driver.approved === true;
    const isMunicipalActive = ['active', 'municipal_approved', 'habilitado'].includes(driver.municipalStatus);
    
    // Asumimos que si cityKey existe y es válido, cuenta. Si no, debe ser de rawson/etc. 
    // Tránsito no debería procesar choferes sin cityKey de todas formas.
    if ((isApprovedLegacy || isMunicipalActive)) {
        return 'enabled';
    }

    // 4. Pendiente (Default)
    return 'pending';
}

export function buildTrafficDriverViewModel(
    driver: any, 
    municipalProfile?: any, 
    publicProfile?: any, 
    location?: any, 
    activeRide?: any,
    documents?: any[],
    trafficObservations?: any[]
) {
    const status = getDriverOperationalStatus(driver, municipalProfile, publicProfile, documents, trafficObservations);
    
    let isStale = true;
    if (location && location.lastSeenAt) {
        let lastSeenMs = 0;
        if (typeof location.lastSeenAt.toMillis === 'function') {
            lastSeenMs = location.lastSeenAt.toMillis();
        } else if (typeof location.lastSeenAt.seconds === 'number') {
            lastSeenMs = location.lastSeenAt.seconds * 1000;
        } else {
            lastSeenMs = new Date(location.lastSeenAt).getTime();
        }
        if (!Number.isNaN(lastSeenMs)) {
            isStale = (Date.now() - lastSeenMs) > 10 * 60 * 1000; // 10 mins
        }
    }

    const rawDriverStatus = location?.driverStatus || driver.driverStatus || 'offline';
    const isOnline = rawDriverStatus === 'online' && !isStale;
    const isBusy = (rawDriverStatus === 'in_ride' || rawDriverStatus === 'busy') && !isStale;

    // Resolve location
    let validLoc = null;
    if (location) {
        const rawLat = location.lat ?? location.latitude ?? location.location?.lat ?? location.currentLocation?.lat;
        const rawLng = location.lng ?? location.longitude ?? location.location?.lng ?? location.currentLocation?.lng;
        const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
        const lng = typeof rawLng === 'number' ? rawLng : Number(rawLng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            validLoc = { lat, lng };
        }
    }

    let trafficStatusLabel = 'Pendiente';
    if (status === 'suspended') trafficStatusLabel = 'Suspendido';
    else if (status === 'observed') trafficStatusLabel = 'Observado';
    else if (status === 'enabled') trafficStatusLabel = 'Habilitado';

    return {
        driverId: driver.id || driver.uid || '',
        displayName: driver.name || publicProfile?.name || 'Conductor',
        cityKey: driver.cityKey || '',
        phone: driver.phone || '',
        vehicleBrand: driver.vehicleModel || location?.vehicle?.brand || publicProfile?.vehicle?.brand || 'N/A',
        vehicleModel: location?.vehicle?.model || publicProfile?.vehicle?.model || '',
        plate: driver.plateNumber || location?.vehicle?.plate || publicProfile?.vehicle?.plate || 'SIN PATENTE',
        driverSubtype: driver.driverSubtype || 'express',
        municipalCode: driver.municipalCode || '',
        approved: driver.approved || false,
        municipalStatus: driver.municipalStatus || '',
        operationalStatus: status,
        trafficStatusLabel,
        isSuspended: !!driver.isSuspended,
        trafficSuspended: !!driver.trafficSuspended,
        municipalSuspended: !!driver.municipalSuspended,
        adminSuspended: !!driver.adminSuspended,
        location: validLoc,
        locationStale: isStale,
        liveStatus: isOnline ? 'online' : (isBusy ? 'in_ride' : 'offline'),
        activeRide: activeRide || null
    };
}
