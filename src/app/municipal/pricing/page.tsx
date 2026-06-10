'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { PricingConfig, DynamicPricingConfig, normalizeCityKey } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

import { useMunicipalContext } from '@/hooks/useMunicipalContext';

export default function MunicipalPricingPage() {
    const { profile, user } = useUser();
    const { cityKey, cityName } = useMunicipalContext();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<PricingConfig | null>(null);
    const [dynamicConfig, setDynamicConfig] = useState<DynamicPricingConfig | null>(null);
    const [loadingDynamic, setLoadingDynamic] = useState(true);

    useEffect(() => {
        if (!firestore || !cityKey) {
            // Si el perfil no tiene cityKey todavía, no mostramos error al cargar,
            // pero el panel indicará que falta sincronizar.
            setLoading(false);
            return;
        }

        const loadPricing = async () => {
            console.log("[MUNI_PRICING] Iniciando carga de tarifas para:", cityKey);
            try {
                // 1. Try to load municipal-specific pricing (includes dynamic pricing config)
                const municipalSnap = await getDoc(doc(firestore, 'municipal_pricing', cityKey));
                if (municipalSnap.exists()) {
                    console.log("[MUNI_PRICING] loaded doc: municipal_pricing/", cityKey);
                    const data = municipalSnap.data() as PricingConfig;
                    setConfig(data);
                    
                    // Unified Source: Extract dynamic config from the same document
                    if (data.dynamicPricing) {
                        setDynamicConfig(data.dynamicPricing);
                    } else {
                        console.log("[MUNI_PRICING] No dynamicPricing found in municipal doc");
                    }
                } else {
                    console.log("[MUNI_PRICING] No municipal doc found, fetching global fallback");
                    // 2. Fallback to global pricing for default values
                    const globalSnap = await getDoc(doc(firestore, 'config', 'pricing'));
                    if (globalSnap.exists()) {
                        console.log("[MUNI_PRICING] Global fallback loaded");
                        setConfig(globalSnap.data() as PricingConfig);
                    } else {
                        console.log("[MUNI_PRICING] Total fallback triggered: using memory defaults");
                        // 3. Last resort fallback (in memory defaults)
                        setConfig({
                            version: 1,
                            DAY_BASE_FARE: 1483,
                            DAY_PRICE_PER_100M: 152,
                            DAY_WAITING_PER_MIN: 220,
                            NIGHT_BASE_FARE: 1652,
                            NIGHT_PRICE_PER_100M: 189,
                            NIGHT_WAITING_PER_MIN: 277,
                            MINIMUM_FARE: 1500,
                            PLATFORM_COMMISSION_RATE: 200, 
                            commission_particular: 0.13,
                            commission_taxi_remis: 0.07,
                            municipal_percentage: 0.05,
                            ASSISTANCE_FEE: 400, 
                            assistanceEnabled: true
                        });
                    }
                }
            } catch (error) {
                console.error("[MUNI_PRICING] error loading:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las tarifas de red. Usando valores sugeridos.' });
                // Emergency fallback on error to let user save
                if (!config) {
                    setConfig({
                        version: 0,
                        DAY_BASE_FARE: 1483,
                        DAY_PRICE_PER_100M: 152,
                        DAY_WAITING_PER_MIN: 220,
                        NIGHT_BASE_FARE: 1652,
                        NIGHT_PRICE_PER_100M: 189,
                        NIGHT_WAITING_PER_MIN: 277,
                        MINIMUM_FARE: 1500,
                        PLATFORM_COMMISSION_RATE: 200, 
                        commission_particular: 0.13,
                        commission_taxi_remis: 0.07,
                        municipal_percentage: 0.05,
                        ASSISTANCE_FEE: 400, 
                        assistanceEnabled: true
                    });
                }
            } finally {
                setLoading(false);
                setLoadingDynamic(false);
            }
        };

        loadPricing();
    }, [firestore, cityKey, toast]);

    const updateDynamicField = (field: keyof DynamicPricingConfig, value: any) => {
        if (!dynamicConfig) return;
        setDynamicConfig({
            ...dynamicConfig,
            [field]: value,
            updatedAt: new Date(),
            updatedBy: profile?.name || user?.email || user?.uid || 'admin'
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        
        if (!user) return;
        
        if (!cityKey) {
            toast({ variant: 'destructive', title: 'Acción bloqueada', description: 'Tu perfil municipal no está completamente configurado (falta cityKey).' });
            return;
        }

        if (!config) {
            toast({ variant: 'destructive', title: 'Acción bloqueada', description: 'El cuadro tarifario no pudo inicializarse. Intentá recargar.' });
            return;
        }

        if (profile?.role === 'admin') {
            toast({ variant: 'destructive', title: 'Acceso de Lectura', description: 'Como Admin Global, solo podés visualizar las tarifas. La edición está reservada para el Administrador Municipal.' });
            return;
        }

        setSaving(true);
        try {
            console.log("[MUNI_PRICING] Calling updateMunicipalPricingV1 for:", cityKey);
            const updatePricing = httpsCallable(functions, 'updateMunicipalPricingV1');
            
            // Merge dynamic pricing config into the main config before saving
            const finalConfig = {
                ...config,
                dynamicPricing: dynamicConfig || undefined
            };

            const result = await updatePricing({
                cityKey,
                config: finalConfig
            });

            const data = result.data as { success: boolean; version: number };
            console.log("[MUNI_PRICING] update SUCCESS, new version:", data.version);

            setConfig({ ...finalConfig, version: data.version });
            toast({ title: '¡Tarifas actualizadas!', description: `Los cambios se guardaron correctamente (V${data.version}).` });
        } catch (error: any) {
            console.error("Error saving pricing:", error);
            const message = error.message || 'No tenés permisos para modificar tarifas en esta ciudad.';
            toast({ 
                variant: 'destructive', 
                title: 'Error de Validación', 
                description: message 
            });
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof PricingConfig, value: string) => {
        if (!config || profile?.role === 'admin') return;
        const num = parseFloat(value);
        setConfig({ ...config, [field]: isNaN(num) ? 0 : num });
    };

    if (loading) {
        return (
            <div className="space-y-6 max-w-4xl mx-auto">
                <Skeleton className="h-10 w-64 bg-white/5" />
                <Skeleton className="h-[400px] w-full bg-white/5 rounded-2xl" />
            </div>
        );
    }

    if (!cityKey) {
        return (
            <div className="py-20 text-center space-y-4">
                <VamoIcon name="alert-triangle" className="h-12 w-12 mx-auto text-red-500" />
                <h3 className="text-xl font-bold text-white">Perfil Incompleto</h3>
                <p className="text-zinc-500 max-w-md mx-auto">
                    Tu cuenta administrativa no tiene configurada su ciudad. 
                </p>
                <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
                    Recargar Panel
                </Button>
            </div>
        );
    }

    const isReadOnly = profile?.role === 'admin';

    return (
        <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter">Gestión de Tarifas</h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Configurá el cuadro tarifario oficial para <span className="text-indigo-400 font-bold">{cityName}</span>
                    </p>
                </div>
                {isReadOnly ? (
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <VamoIcon name="lock" className="h-4 w-4 text-amber-400" />
                        <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Modo Lectura (Admin Global)</p>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                        <VamoIcon name="info" className="h-4 w-4 text-indigo-400" />
                        <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Edición Municipal Activada</p>
                    </div>
                )}
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Tarifas Diurnas */}
                    <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl">
                        <CardHeader className="border-b border-white/5 bg-amber-500/5">
                            <div className="flex items-center gap-2 text-amber-400">
                                <VamoIcon name="sun" className="h-5 w-5" />
                                <CardTitle className="text-lg">Tarifa Diurna</CardTitle>
                            </div>
                            <CardDescription>Horario habitual (06:00 a 23:00)</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="day_base" className="text-zinc-400 text-xs font-bold uppercase">Bajada de Bandera ($)</Label>
                                <Input 
                                    id="day_base"
                                    type="number" 
                                    min="0"
                                    step="1"
                                    required
                                    readOnly={isReadOnly}
                                    value={config?.DAY_BASE_FARE || ''} 
                                    onChange={(e) => updateField('DAY_BASE_FARE', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-amber-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="day_unit" className="text-zinc-400 text-xs font-bold uppercase">Precio por cada 100m ($)</Label>
                                <Input 
                                    id="day_unit"
                                    type="number" 
                                    min="0"
                                    step="0.01"
                                    required
                                    readOnly={isReadOnly}
                                    value={config?.DAY_PRICE_PER_100M || ''} 
                                    onChange={(e) => updateField('DAY_PRICE_PER_100M', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-amber-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="day_wait" className="text-zinc-400 text-xs font-bold uppercase">Minuto de Espera ($)</Label>
                                <Input 
                                    id="day_wait"
                                    type="number" 
                                    min="0"
                                    step="0.01"
                                    required
                                    readOnly={isReadOnly}
                                    value={config?.DAY_WAITING_PER_MIN || ''} 
                                    onChange={(e) => updateField('DAY_WAITING_PER_MIN', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-amber-500/50"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tarifas Nocturnas */}
                    <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl">
                        <CardHeader className="border-b border-white/5 bg-indigo-500/5">
                            <div className="flex items-center gap-2 text-indigo-400">
                                <VamoIcon name="moon" className="h-5 w-5" />
                                <CardTitle className="text-lg">Tarifa Nocturna</CardTitle>
                            </div>
                            <CardDescription>Recargo nocturno (23:00 a 06:00)</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="night_base" className="text-zinc-400 text-xs font-bold uppercase">Bajada de Bandera ($)</Label>
                                <Input 
                                    id="night_base"
                                    type="number" 
                                    min="0"
                                    step="1"
                                    required
                                    readOnly={isReadOnly}
                                    value={config?.NIGHT_BASE_FARE || ''} 
                                    onChange={(e) => updateField('NIGHT_BASE_FARE', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-indigo-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="night_unit" className="text-zinc-400 text-xs font-bold uppercase">Precio por cada 100m ($)</Label>
                                <Input 
                                    id="night_unit"
                                    type="number" 
                                    min="0"
                                    step="0.01"
                                    required
                                    readOnly={isReadOnly}
                                    value={config?.NIGHT_PRICE_PER_100M || ''} 
                                    onChange={(e) => updateField('NIGHT_PRICE_PER_100M', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-indigo-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="night_wait" className="text-zinc-400 text-xs font-bold uppercase">Minuto de Espera ($)</Label>
                                <Input 
                                    id="night_wait"
                                    type="number" 
                                    min="0"
                                    step="0.01"
                                    required
                                    readOnly={isReadOnly}
                                    value={config?.NIGHT_WAITING_PER_MIN || ''} 
                                    onChange={(e) => updateField('NIGHT_WAITING_PER_MIN', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-indigo-500/50"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Parámetros Globales */}
                    <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl md:col-span-2">
                        <CardHeader className="border-b border-white/5 bg-emerald-500/5">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <VamoIcon name="settings" className="h-5 w-5" />
                                <CardTitle className="text-lg">Parámetros de Sistema</CardTitle>
                            </div>
                            <CardDescription>Configuración de mínimos operativos para la ciudad</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="max-w-xs space-y-2">
                                <Label htmlFor="min_fare" className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Tarifa Mínima por Viaje ($)</Label>
                                <Input 
                                    id="min_fare"
                                    type="number" 
                                    min="0"
                                    step="1"
                                    required
                                    readOnly={isReadOnly}
                                    value={config?.MINIMUM_FARE || ''} 
                                    onChange={(e) => updateField('MINIMUM_FARE', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-emerald-500/50"
                                />
                                <p className="text-[10px] text-zinc-600 mt-2">
                                    * La comisión de plataforma y tasas adicionales son gestionadas por la administración central de VamO.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tarifa Dinámica Status */}
                    <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl md:col-span-2">
                        <CardHeader className="border-b border-white/5 bg-indigo-500/10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-indigo-400">
                                    <VamoIcon name="trending-down" className="h-5 w-5" />
                                    <CardTitle className="text-lg">Tarifa Dinámica (VamO SmartPricing)</CardTitle>
                                </div>
                                {dynamicConfig?.enabled ? (
                                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/30 uppercase tracking-widest animate-pulse">Activada</span>
                                ) : (
                                    <span className="bg-zinc-500/20 text-zinc-500 text-[10px] font-black px-3 py-1 rounded-full border border-zinc-500/30 uppercase tracking-widest">Desactivada</span>
                                )}
                            </div>
                            <CardDescription>Optimización de demanda mediante descuentos variables</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            {loadingDynamic ? (
                                <Skeleton className="h-20 w-full bg-white/5" />
                            ) : !dynamicConfig ? (
                                <div className="text-center py-6 border border-dashed border-white/10 rounded-2xl">
                                    <p className="text-zinc-500 text-sm italic">No hay configuración de tarifa dinámica para esta ciudad.</p>
                                </div>
                            ) : (
                                 <div className="space-y-8">
                                    {/* Controles de Edición */}
                                    {!isReadOnly && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 bg-white/[0.03] border border-white/5 rounded-3xl">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-0.5">
                                                        <Label className="text-sm font-black text-white uppercase tracking-tight">Activar Tarifa Dinámica</Label>
                                                        <p className="text-[10px] text-zinc-500 font-bold uppercase">Habilita descuentos automáticos o manuales</p>
                                                    </div>
                                                    <Switch 
                                                        checked={dynamicConfig.enabled} 
                                                        onCheckedChange={(val) => updateDynamicField('enabled', val)}
                                                        className="data-[state=checked]:bg-indigo-500"
                                                    />
                                                </div>

                                                <div className={cn("space-y-6 pt-4 transition-all", !dynamicConfig.enabled && "opacity-40 pointer-events-none grayscale")}>
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-end">
                                                            <Label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Descuento Manual Actual</Label>
                                                            <span className="text-2xl font-black text-indigo-400 leading-none">{dynamicConfig.currentDiscountPercent}%</span>
                                                        </div>
                                                        <Slider 
                                                            value={[dynamicConfig.currentDiscountPercent]}
                                                            min={0}
                                                            max={30}
                                                            step={1}
                                                            onValueChange={([val]) => updateDynamicField('currentDiscountPercent', val)}
                                                            className="py-4"
                                                        />
                                                        <div className="flex justify-between text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">
                                                            <span>Mínimo: 0%</span>
                                                            <span>Máximo Sugerido: 30%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Preview Card */}
                                            <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-6 flex flex-col justify-between">
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-2 text-zinc-500">
                                                        <VamoIcon name="calculator" className="h-4 w-4" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Simulación de Precio</span>
                                                    </div>
                                                    
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-xs font-bold text-zinc-400">
                                                            <span>Tarifa Municipal (Ejemplo)</span>
                                                            <span className="text-white">$10.000</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs font-bold text-emerald-400">
                                                            <span>Descuento VamO ({dynamicConfig.enabled ? dynamicConfig.currentDiscountPercent : 0}%)</span>
                                                            <span>- ${((10000 * (dynamicConfig.enabled ? dynamicConfig.currentDiscountPercent : 0)) / 100).toLocaleString()}</span>
                                                        </div>
                                                        <div className="h-px bg-white/5 my-2" />
                                                        <div className="flex justify-between items-end">
                                                            <span className="text-xs font-black text-white uppercase italic">Pasajero Paga</span>
                                                            <span className="text-2xl font-black text-white leading-none">
                                                                ${(10000 - ((10000 * (dynamicConfig.enabled ? dynamicConfig.currentDiscountPercent : 0)) / 100)).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-6 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-3 items-start">
                                                    <VamoIcon name="alert-circle" className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                                    <p className="text-[9px] text-amber-500/70 font-bold leading-tight">
                                                        Los cambios solo afectan viajes nuevos. Los viajes ya creados mantienen el precio congelado.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Stats Grid (Display only) */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-white/5">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Modo de Algoritmo</p>
                                            <p className="text-xl font-black text-white uppercase italic tracking-tighter">{dynamicConfig.algorithmMode}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Estado Real</p>
                                            <p className={cn(
                                                "text-xl font-black uppercase italic tracking-tighter",
                                                dynamicConfig.enabled ? "text-emerald-400" : "text-zinc-500"
                                            )}>
                                                {dynamicConfig.enabled ? "Activo" : "Pausado"}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tope de Descuento</p>
                                            <p className="text-xl font-black text-zinc-400">{dynamicConfig.maxDiscountPercent}%</p>
                                        </div>
                                        
                                        <div className="md:col-span-3 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex gap-4 items-center">
                                            <div className="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                                <VamoIcon name="shield-check" className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-indigo-200">Regla de Oro VamO</p>
                                                <p className="text-xs text-indigo-400/80">
                                                    La tarifa municipal es el máximo oficial. VamO solo aplica descuentos hacia abajo.
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {(dynamicConfig.updatedAt || dynamicConfig.updatedBy) && (
                                            <div className="md:col-span-3 text-[9px] text-zinc-600 font-bold uppercase tracking-widest flex justify-between">
                                                <span>Última Edición: {dynamicConfig.updatedAt ? new Date(dynamicConfig.updatedAt.toDate ? dynamicConfig.updatedAt.toDate() : dynamicConfig.updatedAt).toLocaleString() : '—'}</span>
                                                {dynamicConfig.updatedBy && <span>Por: {dynamicConfig.updatedBy}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mr-auto">
                        Última actualización: {config?.version ? `V${config.version}` : 'Inicial'}
                    </p>
                    {!isReadOnly && (
                        <Button 
                            type="submit" 
                            disabled={saving}
                            className="h-14 px-10 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-[0.98]"
                        >
                            {saving ? (
                                <><VamoIcon name="loader" className="mr-2 h-5 w-5 animate-spin" /> Guardando...</>
                            ) : (
                                <><VamoIcon name="save" className="mr-2 h-5 w-5" /> Guardar Tarifas</>
                            )}
                        </Button>
                    )}
                </div>
            </form>
            
            <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex gap-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/30">
                    <VamoIcon name="alert-triangle" className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                    <h4 className="text-sm font-black text-amber-200 uppercase tracking-tight">Aviso de Seguridad Operativa</h4>
                    <p className="text-xs text-amber-500/80 leading-relaxed mt-1">
                        Cualquier modificación en el cuadro tarifario impactará únicamente en los viajes que se soliciten **después** de guardar los cambios. Los viajes en curso o ya calculados mantendrán la tarifa con la que fueron creados. Asegurate de que los valores coincidan con la ordenanza municipal vigente.
                    </p>
                </div>
            </div>
        </div>
    );
}
