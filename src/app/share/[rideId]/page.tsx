'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';
import { useFirebaseApp } from '@/firebase';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import RideMap from '@/components/RideMap';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';

export default function PublicSharePage() {
  const { rideId } = useParams();
  const firebaseApp = useFirebaseApp();
  const [ride, setRide] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseApp || !rideId) return;
    const db = getFirestore(firebaseApp);
    
    // 1. Listen to Ride
    const unsubRide = onSnapshot(doc(db, 'rides', rideId as string), (docSnap) => {
      if (docSnap.exists()) {
        setRide({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });

    return () => unsubRide();
  }, [firebaseApp, rideId]);

  useEffect(() => {
    if (!firebaseApp || !ride?.driverId) return;
    const db = getFirestore(firebaseApp);
    
    // 2. Listen to Driver Location
    const unsubLoc = onSnapshot(doc(db, 'drivers_locations', ride.driverId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDriverLocation(data.currentLocation);
      }
    });

    return () => unsubLoc();
  }, [firebaseApp, ride?.driverId]);

  if (loading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-white">
      <VamoIcon name="loader" className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
      <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Localizando viaje...</p>
    </div>
  );

  if (!ride) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-white p-10 text-center">
      <VamoIcon name="alert-circle" className="w-16 h-16 text-zinc-800 mb-6" />
      <h1 className="text-xl font-black uppercase tracking-tighter mb-2">Viaje no disponible</h1>
      <p className="text-zinc-500 text-sm">Este enlace ha expirado o el viaje ya ha finalizado.</p>
    </div>
  );

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="h-screen w-full relative bg-zinc-950 overflow-hidden">
        {/* The Map */}
        <div className="absolute inset-0 z-0">
          <Map
            defaultCenter={ride.origin}
            defaultZoom={15}
            gestureHandling={'greedy'}
            disableDefaultUI={true}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "vamo-share-map"}
          >
            <RideMap 
              status={ride.status}
              origin={ride.origin}
              destination={ride.destination}
              driverLocation={driverLocation}
            />
          </Map>
        </div>

        {/* Header Overlay */}
        <div className="absolute top-6 inset-x-0 z-50 flex flex-col items-center pointer-events-none px-6">
           <div className="glass-morphism premium-shadow rounded-full px-5 py-2 flex items-center gap-2 pointer-events-auto border border-white/5">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-black uppercase tracking-widest text-white">Seguimiento en Vivo - VamO</span>
           </div>
        </div>

        {/* Bottom Card */}
        <div className="absolute bottom-10 inset-x-0 z-50 px-6">
           <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-md mx-auto">
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <VamoIcon name="car" className="w-8 h-8 text-indigo-500" />
                 </div>
                 <div className="flex-1">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Viaje en curso</p>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">
                       {ride.driverName || 'Conductor asignado'}
                    </h3>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-tight">{ride.driverVehicle} • {ride.driverPlate}</p>
                 </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                 <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <p className="text-[11px] text-zinc-400 leading-tight">
                       <span className="text-white font-bold block mb-0.5 uppercase tracking-tighter">Origen:</span>
                       {ride.origin.address}
                    </p>
                 </div>
                 <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                    <p className="text-[11px] text-zinc-400 leading-tight">
                       <span className="text-white font-bold block mb-0.5 uppercase tracking-tighter">Destino:</span>
                       {ride.destination.address}
                    </p>
                 </div>
              </div>

              <div className="mt-8 flex justify-center">
                 <div className="bg-white/5 rounded-full px-4 py-2 border border-white/5 flex items-center gap-2">
                    <VamoIcon name="shield-check" className="w-4 h-4 text-emerald-500" />
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Protegido por VamO Cloud Security</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </APIProvider>
  );
}
