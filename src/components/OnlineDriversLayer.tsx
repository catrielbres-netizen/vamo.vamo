'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { VamoIcon } from '@/components/VamoIcon';
import * as geofire from 'geofire-common';
import { Place } from '@/lib/types';
import { haversineDistance } from '@/lib/geo';
import { useMap } from '@vis.gl/react-google-maps';
import { cn } from '@/lib/utils';

interface OnlineDriversLayerProps {
    origin: Place | null;
    currentOfferedDriverId?: string | null;
    notifiedDrivers?: string[];
    isSearching: boolean;
}

interface DriverLocation {
    id: string;
    lat: number;
    lng: number;
    isOffered: boolean;
}

export function OnlineDriversLayer({ origin, currentOfferedDriverId, notifiedDrivers = [], isSearching }: OnlineDriversLayerProps) {
    const db = useFirestore();
    const map = useMap('passenger-unified-map');
    const [nearbyDrivers, setNearbyDrivers] = useState<Map<string, DriverLocation>>(new Map());

    // ─── MAP SEARCHING PAN ANIMATION / SWEEP EFFECT ───
    useEffect(() => {
        if (!map || !isSearching || !origin) return;

        console.log('[PASSENGER_MAP_DEBUG] Starting sweep animation');
        let animationFrameId: number;
        let angle = 0;
        const radiusLat = 0.002; // Tighter radius to stay focused
        const radiusLng = 0.002;

        // Animate the camera in a slow circle around the origin
        const startAnimation = () => {
            angle += 0.005; // speed (much faster sweep)
            const newLat = origin.lat + Math.sin(angle) * (radiusLat * Math.sin(angle/2)); // spiral effect
            const newLng = origin.lng + Math.cos(angle) * (radiusLng * Math.cos(angle/2));
            
            // Set dynamic zoom to simulate scanning
            const baseZoom = 16.2; // closer to the ground
            const zoomVariation = Math.sin(angle * 2.5) * 1.2; // deep breathing zoom in/out effect
            
            // Use moveCamera instead of panTo for silky smooth 60fps without stutter
            map.moveCamera({ 
                center: { lat: newLat, lng: newLng },
                zoom: baseZoom + zoomVariation 
            });

            animationFrameId = requestAnimationFrame(startAnimation);
        };

        // Delay start slightly to let original map settle
        const timeoutId = setTimeout(() => {
           map.setOptions({ gestureHandling: 'none' }); // disable user pan during search!
           startAnimation();
        }, 1000);

        return () => {
            clearTimeout(timeoutId);
            cancelAnimationFrame(animationFrameId);
            map.setOptions({ gestureHandling: 'greedy' }); // restore
            map.panTo({ lat: origin.lat, lng: origin.lng });
            map.setZoom(15);
        };
    }, [map, isSearching, origin]);

    useEffect(() => {
        if (!db || !origin || !origin.lat || !origin.lng || !isSearching) {
            setNearbyDrivers(new Map());
            return;
        }

        console.log(`[PASSENGER_MAP_DEBUG] Setting up driver listeners for origin [${origin.lat}, ${origin.lng}]`);
        
        // 5km radius to limit documents fetched
        const radiusInM = 5000;
        const center = [origin.lat, origin.lng] as geofire.Geopoint;
        const bounds = geofire.geohashQueryBounds(center, radiusInM);

        const unsubscribes: (() => void)[] = [];

        // We use a local reference to accumulate updates efficiently across all bounds
        const localMap = new Map<string, DriverLocation>();

        const updateState = () => {
            // Force rerender by creating a new map
            setNearbyDrivers(new Map(localMap)); 
        };

        bounds.forEach((b: any) => {
            const q = query(
                collection(db, 'drivers_locations'),
                where('geohash', '>=', b[0]),
                where('geohash', '<=', b[1]),
                limit(50)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                let changed = false;
                snapshot.docChanges().forEach((change) => {
                    const data = change.doc.data();
                    const id = change.doc.id;

                    if (change.type === 'removed') {
                        if (localMap.has(id)) {
                            localMap.delete(id);
                            changed = true;
                        }
                    } else {
                        // Check freshness, status and suspension (like backend matching does)
                        let isValid = true;
                        if (!data.currentLocation) isValid = false;
                        const isVamoApproved = data.approved === true;
                        const isMuniActive = data.municipalStatus === 'active';
                        
                        if (data.driverStatus !== 'online') isValid = false;
                        if (data.isSuspended === true) isValid = false;
                        if (data.hasBalance === false) isValid = false;
                        if (!isVamoApproved && !isMuniActive) isValid = false;
                        
                        const isStale = data.lastSeenAt && (Date.now() - data.lastSeenAt.toMillis() > 15 * 60 * 1000);
                        if (isStale) isValid = false;

                        if (isValid) {
                           // Double check exact distance since geohash bounds are rectangular
                           const distance = haversineDistance(
                               { lat: data.currentLocation.lat, lng: data.currentLocation.lng },
                               { lat: origin.lat, lng: origin.lng }
                           );
                           if (distance <= radiusInM) {
                               localMap.set(id, {
                                   id,
                                   lat: data.currentLocation.lat,
                                   lng: data.currentLocation.lng,
                                   isOffered: false // Will be computed in render
                               });
                               changed = true;
                           } else if (localMap.has(id)) {
                               localMap.delete(id);
                               changed = true;
                           }
                        } else {
                           if (localMap.has(id)) {
                               localMap.delete(id);
                               changed = true;
                           }
                        }
                    }
                });

                if (changed) {
                    console.log(`[PASSENGER_MAP_DEBUG] online drivers loaded: ${localMap.size}`);
                    updateState();
                }
            }, (err) => {
                console.error("[PASSENGER_MAP_DEBUG] error in bounds listener", err);
            });
            
            unsubscribes.push(unsubscribe);
        });

        return () => {
            unsubscribes.forEach(u => u());
        };
    }, [db, origin?.lat, origin?.lng, isSearching]);

    // Debug changes of offered driver
    useEffect(() => {
        if (currentOfferedDriverId) {
            console.log(`[PASSENGER_MAP_DEBUG] current offered driver: ${currentOfferedDriverId}`);
            console.log(`[PASSENGER_MAP_DEBUG] green marker updated for driver ${currentOfferedDriverId}`);
        }
    }, [currentOfferedDriverId]);

    const driversArray = Array.from(nearbyDrivers.values());

    return (
        <>
            {driversArray.map((driver) => {
                const isSelected = driver.id === currentOfferedDriverId || notifiedDrivers.includes(driver.id);
                
                return (
                    <AdvancedMarker 
                        key={driver.id} 
                        position={{ lat: driver.lat, lng: driver.lng }}
                        zIndex={isSelected ? 50 : 10}
                    >
                        <div className="relative group">
                            <div className={cn(
                                "relative flex items-center justify-center w-8 h-8 rounded-full border-[1.5px] border-white/90 transition-all duration-300 transform",
                                "bg-[#22c55e] shadow-[0_2px_4px_rgba(0,0,0,0.3)] animate-pulse",
                                isSelected && "scale-125 ring-2 ring-white/50"
                            )}>
                                <VamoIcon name="car" className="h-4 w-4 text-white drop-shadow-sm" />
                            </div>
                        </div>
                    </AdvancedMarker>
                );
            })}
        </>
    );
}
