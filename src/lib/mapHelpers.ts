import { getDriverOperationalStatus } from './traffic';

export function buildMapDriverViewModel(
    driver: any, 
    publicProfile?: any, 
    location?: any, 
    activeRide?: any
) {
    const status = getDriverOperationalStatus(driver, driver, publicProfile, [], []);
    
    let isStale = true;
    if (location) {
        const timeField = location.lastSeenAt || location.updatedAt;
        if (timeField) {
            let lastSeenMs = 0;
            if (typeof timeField.toMillis === 'function') {
                lastSeenMs = timeField.toMillis();
            } else if (typeof timeField.seconds === 'number') {
                lastSeenMs = timeField.seconds * 1000;
            } else {
                lastSeenMs = new Date(timeField).getTime();
            }
            if (!Number.isNaN(lastSeenMs)) {
                isStale = (Date.now() - lastSeenMs) > 10 * 60 * 1000; // 10 mins
            } else {
                isStale = false; 
            }
        } else {
            isStale = false; // Just created
        }
    } else {
        isStale = true;
    }

    const rawDriverStatus = location?.driverStatus || driver?.driverStatus || 'offline';
    const isOnline = rawDriverStatus === 'online';
    const isBusy = (rawDriverStatus === 'in_ride' || rawDriverStatus === 'busy');

    // Resolve location
    let validLoc = null;
    if (location) {
        const rawLat = location.lat ?? location.latitude ?? location.location?.lat ?? location.currentLocation?.lat ?? location.currentLocation?.latitude;
        const rawLng = location.lng ?? location.longitude ?? location.location?.lng ?? location.currentLocation?.lng ?? location.currentLocation?.longitude;
        const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
        const lng = typeof rawLng === 'number' ? rawLng : Number(rawLng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
            validLoc = { lat, lng };
        }
    }

    let trafficStatusLabel = 'Pendiente';
    if (status === 'suspended') trafficStatusLabel = 'Suspendido';
    else if (status === 'observed') trafficStatusLabel = 'Observado';
    else if (status === 'enabled') trafficStatusLabel = 'Habilitado';

    let liveStatus = 'offline';
    if (isOnline) liveStatus = 'online';
    if (isBusy) liveStatus = 'in_ride';

    const driverId = driver?.id || driver?.uid || location?.id || '';
    const isSuspended = !!driver?.isSuspended;

    // Reglas solicitadas:
    // - Si está online pero sin location: visibleInSideList = true, visibleOnMap = false o ubicación fallback si existe.
    // - Si tiene location válida: visibleOnMap = true.
    // - Si location vieja: visibleOnMap = true con marker “Sin señal reciente” o visibleInSideList = true.
    // - Si está suspendido: visible para Tránsito/Muni, pero no como disponible.
    const hasLocation = !!validLoc;
    const visibleOnMap = hasLocation;
    const visibleInSideList = isOnline || isBusy || isSuspended;

    return {
        driverId,
        displayName: driver?.name || publicProfile?.displayName || publicProfile?.name || location?.driverName || 'Conductor',
        cityKey: driver?.cityKey || location?.cityKey || '',
        phone: driver?.phone || '',
        vehicleBrand: driver?.vehicleModel || location?.vehicle?.brand || publicProfile?.vehicle?.brand || 'N/A',
        vehicleModel: location?.vehicle?.model || publicProfile?.vehicle?.model || '',
        plate: driver?.plateNumber || location?.vehicle?.plate || publicProfile?.vehicle?.plate || 'SIN PATENTE',
        driverSubtype: driver?.driverSubtype || 'express',
        municipalCode: driver?.municipalCode || '',
        approved: driver?.approved || false,
        municipalStatus: driver?.municipalStatus || '',
        operationalStatus: status,
        trafficStatusLabel,
        isSuspended,
        trafficSuspended: !!driver?.trafficSuspended,
        municipalSuspended: !!driver?.municipalSuspended,
        adminSuspended: !!driver?.adminSuspended,
        location: validLoc,
        locationStale: isStale,
        hasLocation,
        liveStatus,
        driverStatus: rawDriverStatus,
        isOnline,
        activeRideId: activeRide?.id || null,
        rideStatus: activeRide?.status || null,
        markerColor: isSuspended ? 'suspended' : isBusy ? 'busy' : (isOnline ? (isStale ? 'stale' : 'online') : 'offline'),
        visibleOnMap,
        visibleInSideList,
        photoUrl: location?.photoUrl || publicProfile?.photoUrl || driver?.photoUrl || null
    };
}
