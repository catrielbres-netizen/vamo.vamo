'use client';

import React, { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, AlertTriangle, Zap, Thermometer, ShieldAlert, BadgeDollarSign, Landmark, ShieldCheck, MapPin } from 'lucide-react';
import { VamoIcon } from '@/components/VamoIcon';
import { safeFixed } from '@/lib/formatters';
import { SystemConfig, PricingConfig, City } from '@/lib/types';

export default function AdminConfigPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [cities, setCities] = useState<City[]>([]);
    const [selectedCityKey, setSelectedCityKey] = useState<string>('rawson');

    // SYSTEM CONFIG
    const [systemConfig, setSystemConfig] = useState<SystemConfig>({
        matchingEnabled: true,
        expressEnabled: true,
        globalMaintenance: false
    });

    // PRICING CONFIG
    const [pricingConfig, setPricingConfig] = useState<PricingConfig>({
        version: 1,
        DAY_BASE_FARE: 1483,
        DAY_PRICE_PER_100M: 152,
        DAY_WAITING_PER_MIN: 220,
        NIGHT_BASE_FARE: 1652,
        NIGHT_PRICE_PER_100M: 189,
        NIGHT_WAITING_PER_MIN: 277,
        MINIMUM_FARE: 1500,
        PLATFORM_COMMISSION_RATE: 0.15,
        commission_particular: 0.13,
        commission_taxi_remis: 0.07,
        municipal_percentage: 0.05,
        ASSISTANCE_FEE: 400,
        assistanceEnabled: true
    });

    useEffect(() => {
        if (!firestore) return;
        fetchInitialData();
    }, [firestore]);

    useEffect(() => {
        if (!firestore || !selectedCityKey) return;
        fetchCityPricing();
    }, [firestore, selectedCityKey]);

    const fetchInitialData = async () => {
        if (!firestore) return;
        try {
            const [sysSnap, citiesSnap] = await Promise.all([
                getDoc(doc(firestore, 'system_config', 'global')),
                getDocs(collection(firestore, 'cities'))
            ]);

            if (sysSnap.exists()) {
                setSystemConfig(sysSnap.data() as SystemConfig);
            }
            
            const citiesList: City[] = [];
            citiesSnap.forEach(d => citiesList.push({ id: d.id, ...d.data() } as City));
            setCities(citiesList);
        } catch (e) {
            console.error("Error fetching initial data:", e);
        }
    };

    const fetchCityPricing = async () => {
        if (!firestore || !selectedCityKey) return;
        setLoading(true);
        try {
            const priceSnap = await getDoc(doc(firestore, 'municipal_pricing', selectedCityKey));
            if (priceSnap.exists()) {
                const data = priceSnap.data() as PricingConfig;
                setPricingConfig({
                    ...pricingConfig,
                    ...data,
                    // Ensure new fields have fallbacks if missing in DB
                    commission_particular: data.commission_particular ?? 0.13,
                    commission_taxi_remis: data.commission_taxi_remis ?? 0.07,
                    municipal_percentage: data.municipal_percentage ?? 0.05,
                });
            }
        } catch (e) {
            console.error("Error fetching city pricing:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!firestore || profile?.role !== 'admin') return;
        setSaving(true);
        try {
            await Promise.all([
                setDoc(doc(firestore, 'system_config', 'global'), { 
                    ...systemConfig, 
                    updatedAt: serverTimestamp(),
                    updatedBy: profile.id,
                    schemaVersion: 1
                }),
                setDoc(doc(firestore, 'municipal_pricing', selectedCityKey), { 
                    ...pricingConfig, 
                    updatedAt: serverTimestamp(),
                    updatedBy: profile.id,
                    version: (pricingConfig.version || 0) + 1,
                    municipalityKey: selectedCityKey
                })
            ]);
            toast({ title: "Configuración Actualizada", description: `Los cambios para ${selectedCityKey} se guardaron correctamente.` });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar los cambios." });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">Configuración <span className="text-primary not-italic">Maestro</span></h1>
                    <p className="text-zinc-500 text-sm font-medium">Control operativo, económico y de emergencia de VamO PRO.</p>
                </div>
                <div className="flex gap-3">
                    <Button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="rounded-full bg-white text-black font-black uppercase tracking-widest text-[10px] h-12 px-8 hover:bg-zinc-200 transition-all shadow-lg shadow-white/5 active:scale-95"
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar Cambios
                    </Button>
                </div>
            </div>

            {/* CITY SELECTOR */}
            <Card className="bg-zinc-900/40 border-zinc-800 rounded-[32px] overflow-hidden backdrop-blur-xl border-t border-white/5">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-primary/10">
                                <MapPin className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Jurisdicción</h2>
                                <p className="text-xs text-zinc-500">Seleccioná la ciudad para configurar sus parámetros económicos.</p>
                            </div>
                        </div>
                        <div className="w-full md:w-64">
                            <Select value={selectedCityKey} onValueChange={setSelectedCityKey}>
                                <SelectTrigger className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-primary/20">
                                    <SelectValue placeholder="Seleccionar Ciudad" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-white rounded-2xl">
                                    {cities.map(city => (
                                        <SelectItem key={city.id} value={city.id || ''}>{city.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ALERT BOX FOR CRITICAL CHANGES */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex gap-4 items-start">
                <div className="mt-1 p-2 rounded-xl bg-amber-500/20">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                    <p className="text-amber-500 font-black uppercase tracking-widest text-[10px]">Atención Administrador</p>
                    <p className="text-amber-500/80 text-xs mt-1 leading-relaxed">
                        Cualquier modificación en las tarifas afectará el cálculo de precios en tiempo real para todos los usuarios de <strong>{selectedCityKey.toUpperCase()}</strong>.
                        Los cambios NO son retroactivos (se guardará un <strong>[PRICING_SNAPSHOT]</strong> en cada nuevo viaje).
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* PRICING SECTION */}
                <div className="space-y-8">
                    <Card className="bg-zinc-900/40 border-zinc-800 rounded-[32px] overflow-hidden backdrop-blur-xl border-t border-white/5">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-2">
                                <BadgeDollarSign className="h-5 w-5 text-primary" />
                                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Tarifas Diurnas</CardTitle>
                            </div>
                            <CardDescription className="text-xs text-zinc-500">Configuración base de precios de 06:00 a 22:00.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Bajada de Bandera ($)</Label>
                                    <Input 
                                        type="number" 
                                        className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-primary/20"
                                        value={pricingConfig.DAY_BASE_FARE}
                                        onChange={e => setPricingConfig({...pricingConfig, DAY_BASE_FARE: Number(e.target.value)})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Precio por cada 100m ($)</Label>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            type="number" 
                                            className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-primary/20"
                                            value={pricingConfig.DAY_PRICE_PER_100M}
                                            onChange={e => setPricingConfig({...pricingConfig, DAY_PRICE_PER_100M: Number(e.target.value)})}
                                        />
                                        <div className="text-[10px] font-black text-zinc-600 bg-zinc-800/40 px-3 py-3 rounded-2xl whitespace-nowrap">
                                            (${pricingConfig.DAY_PRICE_PER_100M * 10} / KM)
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Espera por minuto ($)</Label>
                                    <Input 
                                        type="number" 
                                        className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-primary/20"
                                        value={pricingConfig.DAY_WAITING_PER_MIN}
                                        onChange={e => setPricingConfig({...pricingConfig, DAY_WAITING_PER_MIN: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/40 border-zinc-800 rounded-[32px] overflow-hidden backdrop-blur-xl border-t border-white/5">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-2">
                                <Thermometer className="h-5 w-5 text-indigo-400" />
                                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Tarifas Nocturnas</CardTitle>
                            </div>
                            <CardDescription className="text-xs text-zinc-500">Recargos automáticos de 22:00 a 06:00.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Bajada nocturna ($)</Label>
                                    <Input 
                                        type="number" 
                                        className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-indigo-400/20"
                                        value={pricingConfig.NIGHT_BASE_FARE}
                                        onChange={e => setPricingConfig({...pricingConfig, NIGHT_BASE_FARE: Number(e.target.value)})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Precio nocturno por 100m ($)</Label>
                                    <Input 
                                        type="number" 
                                        className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-indigo-400/20"
                                        value={pricingConfig.NIGHT_PRICE_PER_100M}
                                        onChange={e => setPricingConfig({...pricingConfig, NIGHT_PRICE_PER_100M: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* SYSTEM & CONTROLS */}
                <div className="space-y-8">
                    <Card className="bg-zinc-900/40 border-zinc-800 rounded-[32px] overflow-hidden backdrop-blur-xl border-t border-white/5">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-2">
                                <Landmark className="h-5 w-5 text-amber-500" />
                                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Economía [PRICING_CONFIG]</CardTitle>
                            </div>
                            <CardDescription className="text-xs text-zinc-500">Márgenes de rentabilidad por tipo de conductor.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Comisión Particulares (%)</Label>
                                    <div className="flex items-center gap-4">
                                        <Input 
                                            type="number" 
                                            className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-amber-500/20"
                                            value={pricingConfig.commission_particular * 100}
                                            onChange={e => setPricingConfig({...pricingConfig, commission_particular: Number(e.target.value) / 100})}
                                        />
                                        <div className="text-[10px] font-black text-zinc-600 bg-zinc-800/40 px-4 py-3 rounded-2xl">
                                            {safeFixed(pricingConfig.commission_particular * 100, 1)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Comisión Taxis/Remises (%)</Label>
                                    <div className="flex items-center gap-4">
                                        <Input 
                                            type="number" 
                                            className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-amber-500/20"
                                            value={pricingConfig.commission_taxi_remis * 100}
                                            onChange={e => setPricingConfig({...pricingConfig, commission_taxi_remis: Number(e.target.value) / 100})}
                                        />
                                        <div className="text-[10px] font-black text-zinc-600 bg-zinc-800/40 px-4 py-3 rounded-2xl">
                                            {safeFixed(pricingConfig.commission_taxi_remis * 100, 1)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Tasa Municipal (%)</Label>
                                    <div className="flex items-center gap-4">
                                        <Input 
                                            type="number" 
                                            className="bg-black/50 border-zinc-800 rounded-2xl h-12 font-bold text-white focus:ring-amber-500/20"
                                            value={pricingConfig.municipal_percentage * 100}
                                            onChange={e => setPricingConfig({...pricingConfig, municipal_percentage: Number(e.target.value) / 100})}
                                        />
                                        <div className="text-[10px] font-black text-zinc-600 bg-zinc-800/40 px-4 py-3 rounded-2xl">
                                            {safeFixed(pricingConfig.municipal_percentage * 100, 1)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-blue-500/5 border-blue-500/10 rounded-[32px] overflow-hidden backdrop-blur-xl border-t border-blue-500/10">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-2">
                                <ShieldCheck className="h-5 w-5 text-blue-500" />
                                <CardTitle className="text-xl font-black text-blue-500 uppercase tracking-tighter">Asistencia VamO</CardTitle>
                            </div>
                            <CardDescription className="text-xs text-blue-500/60">Fondo de asistencia al pasajero (F.A.P.).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="p-6 bg-blue-500/10 rounded-3xl space-y-6 border border-blue-500/20">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-black text-blue-600 uppercase tracking-tight">Cobro de Asistencia</Label>
                                        <p className="text-[10px] text-blue-700/70 font-bold uppercase">Habilitar fondo de protección</p>
                                    </div>
                                    <Switch 
                                        checked={pricingConfig.assistanceEnabled} 
                                        onCheckedChange={v => setPricingConfig({...pricingConfig, assistanceEnabled: v})}
                                        className="data-[state=checked]:bg-blue-600"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-blue-700">Aporte por Viaje Express ($)</Label>
                                    <Input 
                                        type="number" 
                                        disabled={!pricingConfig.assistanceEnabled}
                                        className="bg-black/40 border-blue-500/20 rounded-2xl h-12 font-bold text-white focus:ring-blue-500/20"
                                        value={pricingConfig.ASSISTANCE_FEE}
                                        onChange={e => setPricingConfig({...pricingConfig, ASSISTANCE_FEE: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/40 border-zinc-800 rounded-[32px] overflow-hidden backdrop-blur-xl border-t border-white/5">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-2">
                                <Zap className="h-5 w-5 text-primary" />
                                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Motor Operativo</CardTitle>
                            </div>
                            <CardDescription className="text-xs text-zinc-500">Control de funcionalidades del núcleo VamO.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="p-6 bg-black/40 rounded-3xl space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-black text-white uppercase tracking-tight">Sistema de Matching</Label>
                                        <p className="text-[10px] text-zinc-500 font-bold uppercase">Emparejamiento de viajes</p>
                                    </div>
                                    <Switch 
                                        checked={systemConfig.matchingEnabled} 
                                        onCheckedChange={v => setSystemConfig({...systemConfig, matchingEnabled: v})}
                                        className="data-[state=checked]:bg-primary"
                                    />
                                </div>
                                
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-black text-white uppercase tracking-tight">Nivel Express</Label>
                                        <p className="text-[10px] text-zinc-500 font-bold uppercase">Habilitar servicio express</p>
                                    </div>
                                    <Switch 
                                        checked={systemConfig.expressEnabled} 
                                        onCheckedChange={v => setSystemConfig({...systemConfig, expressEnabled: v})}
                                        className="data-[state=checked]:bg-primary"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-red-500/5 border-red-500/10 rounded-[32px] overflow-hidden backdrop-blur-xl border-t border-red-500/10">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-2">
                                <ShieldAlert className="h-5 w-5 text-red-500" />
                                <CardTitle className="text-xl font-black text-red-500 uppercase tracking-tighter italic">Botón Rojo</CardTitle>
                            </div>
                            <CardDescription className="text-xs text-red-500/60 font-medium italic">Protocolo de emergencia global.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="p-6 bg-red-500/10 rounded-3xl space-y-4 border border-red-500/20">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-black text-red-600 uppercase tracking-tight">Modo Mantenimiento</Label>
                                        <p className="text-[10px] text-red-700/70 font-bold uppercase">Bloqueo total de la plataforma</p>
                                    </div>
                                    <Switch 
                                        checked={systemConfig.globalMaintenance} 
                                        onCheckedChange={v => setSystemConfig({...systemConfig, globalMaintenance: v})}
                                        className="data-[state=checked]:bg-red-600"
                                    />
                                </div>
                                <p className="text-[9px] text-red-500/60 leading-tight italic">
                                    * Activar este modo impedirá que cualquier usuario (pasajero o conductor) pueda utilizar la app fuera del panel administrativo. Usar solo en emergencias críticas.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
