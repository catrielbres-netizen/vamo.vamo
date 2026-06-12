'use client';

import React, { useState, useMemo } from 'react';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { collection, query, orderBy, limit, doc, where, QueryConstraint } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getCityDefaultLocation } from '@/lib/city-resolution';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VamoIcon, WhatsAppLogo } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { PanicAlert } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Loader2, ShieldAlert, MapPin, Share2, Phone, Car } from 'lucide-react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { useDoc } from '@/firebase/firestore/use-doc';

export default function AdminAlertsPage() {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const sirenIntervalRef = React.useRef<any>(null);
  const { cityKey: activeCityKey } = useMunicipalContext();

  const alertsQuery = useMemo(() => {
    if (!firestore) return null;
    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
      limit(50)
    ];
    if (activeCityKey) {
      constraints.push(where('cityKey', '==', activeCityKey));
    }
    return query(
      collection(firestore, 'panic_alerts'),
      ...constraints
    );
  }, [firestore, activeCityKey]);

  const { data: alerts, isLoading } = useCollection<PanicAlert>(alertsQuery);

  const hasActiveAlerts = useMemo(() => {
    return alerts?.some(a => !a.resolved);
  }, [alerts]);

  // --- SIREN LOGIC ---
  const playSiren = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const playBeep = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Police-like siren (Two tones)
      playBeep(900, ctx.currentTime, 0.4);
      playBeep(600, ctx.currentTime + 0.5, 0.4);
    } catch (e) {
      console.warn("Siren failed:", e);
    }
  };

  React.useEffect(() => {
    if (hasActiveAlerts && !isMuted) {
      sirenIntervalRef.current = setInterval(playSiren, 1200);
    } else {
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
    }
    return () => {
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
    };
  }, [hasActiveAlerts, isMuted]);

  const handleResolve = async (alertId: string) => {
    if (!firebaseApp || isProcessing) return;
    setIsProcessing(alertId);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const resolvePanic = httpsCallable(functions, 'resolvePanicAlertV1');
      await resolvePanic({ alertId });
      toast({ title: 'Alerta resuelta', description: 'El incidente ha sido marcado como cerrado.' });
    } catch (error: any) {
      console.error('Error resolving panic:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo resolver la alerta.',
      });
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="p-6 space-y-8 max-w-6xl mx-auto pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 italic">
              <VamoIcon name="shield-alert" className="h-8 w-8 text-red-500 not-italic" />
              Alertas de <span className="text-red-500 not-italic">Pánico</span>
            </h1>
            <p className="text-muted-foreground font-medium">
              Protocolo de seguridad y respuesta inmediata.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {hasActiveAlerts && (
                <Button 
                    variant={isMuted ? "outline" : "destructive"} 
                    size="sm" 
                    onClick={() => setIsMuted(!isMuted)}
                    className={cn(
                        "rounded-xl font-black text-[10px] uppercase tracking-widest px-4 border-red-500/20",
                        !isMuted && "animate-pulse"
                    )}
                >
                    <VamoIcon name={isMuted ? "volume-x" : "volume-2"} className="h-4 w-4 mr-2" />
                    {isMuted ? 'Sirena Silenciada' : 'Silenciar Alarma'}
                </Button>
            )}
            <div className="hidden md:block">
                <Badge variant="outline" className="border-red-500/20 bg-red-500/5 text-red-500 px-4 py-2 rounded-xl animate-pulse font-black uppercase tracking-widest text-[10px]">
                    Monitoreo Activo
                </Badge>
            </div>
          </div>
        </div>

        {isLoading ? (
            <div className="space-y-4">
                <Skeleton className="h-32 rounded-2xl w-full" />
                <Skeleton className="h-32 rounded-2xl w-full" />
            </div>
        ) : alerts?.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-800 py-32 rounded-3xl flex flex-col items-center justify-center bg-black/20">
                <VamoIcon name="check-circle" className="h-16 w-16 text-zinc-800 mb-4" />
                <p className="text-xl font-black text-zinc-600 uppercase tracking-widest">Sin Incidencias Activas</p>
                <p className="text-sm text-zinc-700 mt-2">La plataforma opera con total normalidad.</p>
            </div>
        ) : (
          <div className="grid gap-6">
            {alerts?.map((alert) => (
              <Card key={alert.id} className={cn(
                "overflow-hidden border-zinc-800 bg-black/40 backdrop-blur-xl transition-all relative",
                !alert.resolved && "border-l-4 border-l-red-600 ring-1 ring-red-500/10 shadow-[0_0_50px_-12px_rgba(220,38,38,0.2)]"
              )}>
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className={cn(
                        "uppercase font-black tracking-widest text-[10px] px-3 py-1",
                        alert.resolved ? "bg-zinc-800 text-zinc-500" : "bg-red-600 text-white animate-pulse"
                      )}>
                        {alert.resolved ? 'RESOLVIDA' : 'ALERTA CRÍTICA'}
                      </Badge>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-tighter">VIAJE: {alert.rideId?.substring(0, 12)}...</span>
                      <span className="text-[10px] text-zinc-500 font-bold ml-auto md:ml-4 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                        {alert.createdAt?.toDate ? format(alert.createdAt.toDate(), "d 'de' MMMM, HH:mm'hs'", { locale: es }) : 'RECIÉN AHORA'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px] uppercase font-black text-zinc-600 tracking-widest">Activada por</Label>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                <VamoIcon name={alert.triggeredByRole === 'driver' ? 'bus' : 'user'} className="h-4 w-4 text-zinc-400" />
                            </div>
                            <span className="font-black text-white">{alert.triggeredByRole === 'driver' ? 'Conductor' : 'Pasajero'}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px] uppercase font-black text-zinc-600 tracking-widest">Coordenadas</Label>
                        <div className="flex items-center gap-3">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className={cn(
                                    "h-8 rounded-lg border-zinc-800 font-black text-[10px] uppercase",
                                    expandedId === alert.id ? "bg-primary text-white border-primary" : "bg-zinc-900"
                                )}
                                onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id!)}
                            >
                                <MapPin className="h-3 w-3 mr-2" /> 
                                {expandedId === alert.id ? 'OCULTAR MAPA' : 'VER EN MAPA'}
                            </Button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px] uppercase font-black text-zinc-600 tracking-widest">Estado de Viaje</Label>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                <VamoIcon name="activity" className="h-4 w-4 text-zinc-400" />
                            </div>
                            <span className="font-black text-zinc-300 uppercase tracking-tighter">{alert.rideStatus}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-4">
                    {!alert.resolved ? (
                         <Button 
                            onClick={() => handleResolve(alert.id!)}
                            disabled={isProcessing === alert.id}
                            variant="morphic"
                            className="bg-green-600 hover:bg-green-700 text-white font-black px-8 py-6 rounded-2xl shadow-xl shadow-green-900/40"
                         >
                            {isProcessing === alert.id ? <Loader2 className="animate-spin mr-2" /> : <VamoIcon name="shield-check" className="mr-2 h-5 w-5" />}
                            RESOLVER INCIDENTE
                         </Button>
                    ) : (
                        <div className="text-right flex flex-col items-end gap-2 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                            <div className="flex items-center gap-2 text-green-500 font-black text-[10px] uppercase tracking-widest leading-none">
                                <VamoIcon name="check-circle" className="h-4 w-4" /> Caso Cerrado
                            </div>
                            <div className="text-[10px] text-zinc-500 font-medium">
                                Procesado por {alert.resolvedBy?.substring(0, 8)}...
                            </div>
                            {alert.resolvedAt && (
                                <div className="text-[9px] text-zinc-600 italic font-bold">
                                    {format(alert.resolvedAt.toDate(), "HH:mm'hs' d/M/yy", { locale: es })}
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                </div>

                {/* EXPANDED EMERGENCY CENTER */}
                {expandedId === alert.id && (
                    <div className="border-t border-zinc-800 bg-zinc-950/50 p-6 animate-in slide-in-from-top duration-300">
                        <EmergencyDetail alert={alert} />
                    </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </APIProvider>
  );
}

function EmergencyDetail({ alert }: { alert: PanicAlert }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    // Fetch live ride and user data for the report
    const rideRef = useMemo(() => alert.rideId ? doc(firestore!, 'rides', alert.rideId) : null, [firestore, alert.rideId]);
    const { data: ride } = useDoc<any>(rideRef);

    const driverRef = useMemo(() => alert.driverId ? doc(firestore!, 'users', alert.driverId) : null, [firestore, alert.driverId]);
    const { data: driver } = useDoc<any>(driverRef);

    const passengerRef = useMemo(() => alert.passengerId ? doc(firestore!, 'users', alert.passengerId) : null, [firestore, alert.passengerId]);
    const { data: passenger } = useDoc<any>(passengerRef);

    const generateReport = () => {
        const timestamp = alert.createdAt?.toDate ? format(alert.createdAt.toDate(), "HH:mm'hs' d/M/yy") : 'Reciente';
        const locationLink = alert.location ? `https://www.google.com/maps?q=${alert.location.lat},${alert.location.lng}` : 'No disponible';
        
        const report = `🚨 *REPORTE DE EMERGENCIA VamO* 🚨\n\n` +
            `*Evento:* Alerta de Pánico\n` +
            `*Hora:* ${timestamp}\n` +
            `*Activado por:* ${alert.triggeredByRole === 'driver' ? 'Conductor' : 'Pasajero'}\n\n` +
            `🚘 *Vehículo:* ${ride?.driverVehicle || 'No especificado'}\n` +
            `🔢 *Patente:* ${ride?.driverPlate || 'No disponible'}\n\n` +
            `👤 *Pasajero:* ${passenger?.name || 'Cargando...'} (${passenger?.phone || 'No disponible'})\n` +
            `👨‍✈️ *Conductor:* ${driver?.name || 'Cargando...'} (${driver?.phone || 'No disponible'})\n\n` +
            `📍 *Ubicación:* ${locationLink}`;

        if (navigator.share) {
            navigator.share({
                title: 'Alerta de Emergencia VamO',
                text: report,
            }).catch(() => {
                navigator.clipboard.writeText(report);
                toast({ title: 'Copiado al portapapeles', description: 'El reporte está listo para ser compartido.' });
            });
        } else {
            navigator.clipboard.writeText(report);
            toast({ title: 'Copiado al portapapeles', description: 'El reporte está listo para ser compartido.' });
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                        <Label className="text-[10px] uppercase font-black text-zinc-500">Pasajero</Label>
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-white">{passenger?.name || '...'}</span>
                            <a href={`tel:${passenger?.phone}`} className="p-2 bg-primary/10 text-primary rounded-lg">
                                <Phone className="h-4 w-4" />
                            </a>
                        </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                        <Label className="text-[10px] uppercase font-black text-zinc-500">Conductor</Label>
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-white">{driver?.name || '...'}</span>
                            <a href={`tel:${driver?.phone}`} className="p-2 bg-primary/10 text-primary rounded-lg">
                                <Phone className="h-4 w-4" />
                            </a>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                    <Label className="text-[10px] uppercase font-black text-zinc-500">Vehículo Registrado</Label>
                    <div className="flex items-center gap-3">
                        <Car className="h-5 w-5 text-primary" />
                        <div>
                            <p className="font-bold text-white leading-none">{ride?.driverVehicle || 'Cargando datos...'}</p>
                            <p className="text-xs text-zinc-500 font-mono mt-1">PATENTE: {ride?.driverPlate || 'N/D'}</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <Button onClick={generateReport} className="flex-1 bg-white text-black font-black h-12 rounded-xl hover:bg-zinc-200">
                        <Share2 className="mr-2 h-5 w-5" /> REPORTAR A POLICÍA
                    </Button>
                    <Button variant="outline" className="border-zinc-800 text-zinc-400 h-12 rounded-xl" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent('🚨 EMERGENCIA VamO: ' + (alert.location ? `https://www.google.com/maps?q=${alert.location.lat},${alert.location.lng}` : ''))}`, '_blank')}>
                        <WhatsAppLogo className="mr-2 h-5 w-5" /> WHATSAPP
                    </Button>
                </div>
            </div>

            <div className="h-[300px] rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative bg-zinc-900 group">
                <Map
                    defaultCenter={alert.location ? { lat: alert.location.lat, lng: alert.location.lng } : getCityDefaultLocation(profile?.cityKey)}
                    defaultZoom={15}
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    mapId="emergency_map"
                >
                    {alert.location && <Marker position={{ lat: alert.location.lat, lng: alert.location.lng }} />}
                </Map>
                <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-black text-red-500 uppercase flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" /> SEGUIMIENTO EN VIVO
                </div>
            </div>
        </div>
    );
}
