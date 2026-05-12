'use client';

import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { PanicAlert } from '@/lib/types';
import { ShieldAlert, X, Eye, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function GlobalPanicListener() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const router = useRouter();
    const [activeAlerts, setActiveAlerts] = useState<PanicAlert[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!firestore || !profile) return;

        // Determine filters based on role
        let q;
        const alertsRef = collection(firestore, 'panic_alerts');

        if (profile.role === 'admin') {
            // Global admin sees all unresolved alerts
            q = query(alertsRef, where('resolved', '==', false));
        } else if (['admin_municipal', 'traffic_municipal', 'operator_municipal'].includes(profile.role)) {
            // Municipal users see only their city
            if (!profile.cityKey) return;
            q = query(alertsRef, where('resolved', '==', false), where('cityKey', '==', profile.cityKey));
        } else {
            return; // Other roles don't see panic alerts globally
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PanicAlert));
            setActiveAlerts(alerts);
            
            if (alerts.length > 0 && !isMuted) {
                playAlarm();
            } else {
                stopAlarm();
            }
        });

        return () => {
            unsubscribe();
            stopAlarm();
        };
    }, [firestore, profile, isMuted]);

    const playAlarm = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
            audioRef.current.loop = true;
        }
        audioRef.current.play().catch(e => console.warn('[PANIC_AUDIO] Interaction required to play sound', e));
    };

    const stopAlarm = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    };

    const handleViewAlert = (alert: PanicAlert) => {
        if (profile?.role === 'admin') {
            router.push(`/admin/alerts?id=${alert.id}`);
        } else {
            router.push(`/municipal/alerts?id=${alert.id}`);
        }
    };

    if (activeAlerts.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-xl px-4 animate-in slide-in-from-top-10 duration-500">
            <div className="bg-red-600 text-white rounded-[2rem] shadow-2xl shadow-red-500/50 p-6 flex flex-col gap-4 border-4 border-white/20 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center animate-pulse shadow-lg">
                            <ShieldAlert className="text-red-600 h-7 w-7" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tighter leading-none mb-1">Pánico Activado</h2>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{activeAlerts.length} {activeAlerts.length === 1 ? 'alerta activa' : 'alertas activas'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="secondary" 
                            size="icon" 
                            className="rounded-full bg-white/20 hover:bg-white/30 border-0"
                            onClick={() => setIsMuted(!isMuted)}
                        >
                            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>

                <div className="space-y-2">
                    {activeAlerts.slice(0, 2).map((alert) => (
                        <div key={alert.id} className="bg-black/20 rounded-2xl p-4 border border-white/10 flex items-center justify-between group hover:bg-black/30 transition-all">
                            <div>
                                <p className="text-xs font-black uppercase italic">{alert.triggeredByRole === 'driver' ? 'Conductor' : 'Pasajero'} en emergencia</p>
                                <p className="text-[10px] opacity-70 font-mono mt-0.5">VIAJE: {alert.rideId?.substring(0, 8) || 'N/A'}...</p>
                            </div>
                            <Button 
                                size="sm" 
                                className="bg-white text-red-600 hover:bg-zinc-100 font-black uppercase tracking-widest text-[10px] rounded-xl px-4"
                                onClick={() => handleViewAlert(alert)}
                            >
                                <Eye className="w-3.5 h-3.5 mr-2" /> Atender
                            </Button>
                        </div>
                    ))}
                    {activeAlerts.length > 2 && (
                        <p className="text-center text-[10px] font-bold uppercase opacity-60">Y {activeAlerts.length - 2} alertas más...</p>
                    )}
                </div>

                <p className="text-[10px] font-black uppercase tracking-widest text-center animate-pulse text-white/80 border-t border-white/10 pt-4">
                    Atención inmediata requerida • No cerrar esta pestaña
                </p>
            </div>
        </div>
    );
}
