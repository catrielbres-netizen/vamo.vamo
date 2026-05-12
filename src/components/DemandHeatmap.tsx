'use client';

import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, getFirestore, limit, orderBy } from 'firebase/firestore';
import { useFirebaseApp } from '@/firebase';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { VamoIcon } from './VamoIcon';
import { useDriverData } from '@/context/DriverRealtimeProvider';

export function DemandHeatmap() {
  const firebaseApp = useFirebaseApp();
  const { profile, location: currentLocation } = useDriverData();
  const [points, setPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseApp || !profile?.cityKey) return;
    const db = getFirestore(firebaseApp);
    
    const fetchDemand = async () => {
      try {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const q = query(
          collection(db, 'ride_requests'),
          where('cityKey', '==', profile.cityKey),
          where('createdAt', '>=', hourAgo),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        
        const snap = await getDocs(q);
        const coords = snap.docs.map(doc => doc.data().origin).filter(Boolean);
        setPoints(coords);
      } catch (e) {
        console.error("Heatmap fetch failed", e);
      } finally {
        setLoading(false);
      }
    };

    fetchDemand();
    const interval = setInterval(fetchDemand, 120000); // refresh every 2 mins
    return () => clearInterval(interval);
  }, [firebaseApp, profile?.cityKey]);

  // if (!currentLocation) return null; // Removed to avoid silent hiding

  return (
    <div className="w-full h-52 rounded-[2.5rem] overflow-hidden border-2 border-indigo-500/20 relative bg-zinc-900/80 backdrop-blur-xl mb-6 shadow-[0_0_40px_rgba(99,102,241,0.1)] group">
      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
        <div className="absolute inset-0 w-full h-full">
            {currentLocation ? (
              <Map
                defaultCenter={currentLocation}
                defaultZoom={13}
                gestureHandling={'cooperative'}
                disableDefaultUI={true}
                mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "vamo-demand-map"}
              >
                {/* Demand Areas as Pulsing Auras */}
                {points.map((p, i) => (
                   <AdvancedMarker key={i} position={p}>
                      <div className="relative">
                         <div className="absolute -inset-8 bg-indigo-500/20 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                         <div className="w-12 h-12 bg-indigo-500/30 rounded-full blur-xl animate-pulse" />
                         <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,1)]" />
                      </div>
                   </AdvancedMarker>
                ))}
                
                {/* Driver Position */}
                <AdvancedMarker position={currentLocation}>
                   <div className="relative group">
                      <div className="absolute -inset-4 bg-white/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
                      <div className="relative w-6 h-6 bg-indigo-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center">
                         <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      </div>
                   </div>
                </AdvancedMarker>
              </Map>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/20 animate-pulse">
                 <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mb-3">
                    <VamoIcon name="map" className="w-6 h-6 text-indigo-400" />
                 </div>
                 <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.3em]">Sincronizando Radar...</p>
                 <div className="mt-4 flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-500/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500/40 rounded-full animate-bounce" />
                 </div>
              </div>
            )}
        </div>
      </APIProvider>

      {/* Header Overlay */}
      <div className="absolute top-5 left-5 z-20 flex flex-col gap-1">
         <div className="bg-zinc-950/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/5 flex items-center gap-2.5 shadow-xl">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-wider">Demanda Realtime</span>
            <span className="text-[10px] font-bold text-zinc-500">60m</span>
         </div>
      </div>
      
      {loading && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[4px] flex items-center justify-center z-30">
           <VamoIcon name="loader" className="w-8 h-8 animate-spin text-white" />
        </div>
      )}
      
      {points.length === 0 && !loading && (
          <div className="absolute bottom-5 left-5 right-5 z-20 bg-zinc-950/60 backdrop-blur-md p-2.5 rounded-2xl border border-white/5 text-center">
             <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Esperando picos de demanda en Rawson</p>
          </div>
      )}
    </div>
  );
}
