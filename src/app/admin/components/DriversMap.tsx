// src/app/admin/components/DriversMap.tsx
'use client'
import { APIProvider, Map, AdvancedMarker, Pin, useApiIsLoaded } from '@vis.gl/react-google-maps';
import { UserProfile } from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';

interface DriversMapProps {
    drivers: WithId<UserProfile>[];
}

const mapCenter = { lat: -43.3005, lng: -65.1023 }; // Rawson, Chubut

function MapComponent({ drivers }: DriversMapProps) {
    const isLoaded = useApiIsLoaded();

    if (!isLoaded) {
        return (
             <div className="h-[400px] flex items-center justify-center bg-muted">
                <p className="text-muted-foreground text-center">Cargando mapa...</p>
            </div>
        )
    }

    return (
        <Map
            defaultCenter={mapCenter}
            defaultZoom={12}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'}
            gestureHandling={'greedy'}
            disableDefaultUI={true}
        >
            {drivers.map((driver) => 
                driver.currentLocation && (
                    <AdvancedMarker 
                        key={driver.id} 
                        position={driver.currentLocation}
                        title={driver.name}
                    >
                        <Pin 
                            background={'#FBBC04'}
                            glyphColor={'#000'}
                            borderColor={'#000'}
                        />
                    </AdvancedMarker>
                )
            )}
        </Map>
    )
}


export default function DriversMap({ drivers }: DriversMapProps) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        return (
            <div className="h-[400px] flex items-center justify-center bg-muted">
                <p className="text-destructive text-center p-4">
                    La funcionalidad de mapa está deshabilitada.<br/> 
                    La API Key de Google Maps no está configurada en el entorno.
                </p>
            </div>
        )
    }

    return (
        <div style={{ height: '400px', width: '100%' }}>
            <APIProvider 
                apiKey={apiKey}
                libraries={['places']}
            >
                <MapComponent drivers={drivers} />
            </APIProvider>
        </div>
    );
}
