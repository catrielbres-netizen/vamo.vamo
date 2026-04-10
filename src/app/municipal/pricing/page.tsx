'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { PricingConfig, normalizeCityKey } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export default function MunicipalPricingPage() {
    const { profile, user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<PricingConfig | null>(null);

    // CRÍTICO: Usamos el cityKey guardado en la base de datos, no uno calculado al vuelo,
    // ya que las reglas de seguridad de Firestore validan contra el campo 'cityKey' del usuario.
    const cityKey = profile?.cityKey;

    useEffect(() => {
        if (!firestore || !cityKey) {
            // Si el perfil no tiene cityKey todavía, no mostramos error al cargar,
            // pero el panel indicará que falta sincronizar.
            setLoading(false);
            return;
        }

        const loadPricing = async () => {
            try {
                // 1. Try to load city-specific pricing
                const citySnap = await getDoc(doc(firestore, 'cities', cityKey));
                if (citySnap.exists() && citySnap.data().pricing) {
                    setConfig(citySnap.data().pricing);
                } else {
                    // 2. Fallback to global pricing for default values
                    const globalSnap = await getDoc(doc(firestore, 'config', 'pricing'));
                    if (globalSnap.exists()) {
                        setConfig(globalSnap.data() as PricingConfig);
                    } else {
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
                            PLATFORM_COMMISSION_RATE: 200, // $200 example
                            ASSISTANCE_FEE: 400, // $400 FAP
                            assistanceEnabled: true
                        });
                    }
                }
            } catch (error) {
                console.error("Error loading pricing:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las tarifas.' });
            } finally {
                setLoading(false);
            }
        };

        loadPricing();
    }, [firestore, cityKey, toast]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !user) return;
        
        if (!cityKey) {
            toast({ variant: 'destructive', title: 'Acción bloqueada', description: 'Tu perfil municipal no está completamente configurado (falta cityKey). Contactá a soporte.' });
            return;
        }

        if (!config) {
            toast({ variant: 'destructive', title: 'Acción bloqueada', description: 'El cuadro tarifario no está inicializado. Recargá la página.' });
            return;
        }

        setSaving(true);
        try {
            await setDoc(doc(firestore, 'cities', cityKey), {
                cityKey,
                cityName: profile?.city,
                pricing: {
                    ...config,
                    version: (config.version || 0) + 1
                },
                updatedAt: serverTimestamp(),
                updatedBy: user.uid
            }, { merge: true });

            toast({ title: '¡Tarifas actualizadas!', description: 'Los cambios se guardaron correctamente en la base de datos.' });
        } catch (error: any) {
            console.error("Error saving pricing:", error);
            
            let errorMessage = 'No se pudieron guardar los cambios.';
            if (error.code === 'permission-denied') {
                errorMessage = 'Permiso denegado: Tu perfil no tiene asignado correctamente el identificador de la ciudad. Recargá la página o contactá a soporte.';
            }

            toast({ variant: 'destructive', title: 'Error al Guardar', description: errorMessage });
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof PricingConfig, value: string) => {
        if (!config) return;
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
                <VamoIcon name="shield-alert" className="h-12 w-12 mx-auto text-red-500" />
                <h3 className="text-xl font-bold text-white">Perfil Incompleto</h3>
                <p className="text-zinc-500 max-w-md mx-auto">
                    Tu cuenta administrativa no tiene configurada la clave de ciudad ("cityKey"). 
                    <br/><br/>
                    Esto suele ocurrir si tu perfil fue creado manualmente sin sincronizar. El sistema está verificando tus datos en segundo plano. Intentá recargar la página en unos segundos.
                </p>
                <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
                    Recargar Panel
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter">Gestión de Tarifas</h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Configurá el cuadro tarifario oficial para <span className="text-indigo-400 font-bold">{profile?.city}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                    <VamoIcon name="info" className="h-4 w-4 text-indigo-400" />
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Cambios en tiempo real</p>
                </div>
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
                                    value={config?.DAY_BASE_FARE} 
                                    onChange={(e) => updateField('DAY_BASE_FARE', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-amber-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="day_unit" className="text-zinc-400 text-xs font-bold uppercase">Precio por cada 100m ($)</Label>
                                <Input 
                                    id="day_unit"
                                    type="number" 
                                    value={config?.DAY_PRICE_PER_100M} 
                                    onChange={(e) => updateField('DAY_PRICE_PER_100M', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-amber-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="day_wait" className="text-zinc-400 text-xs font-bold uppercase">Minuto de Espera ($)</Label>
                                <Input 
                                    id="day_wait"
                                    type="number" 
                                    value={config?.DAY_WAITING_PER_MIN} 
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
                                    value={config?.NIGHT_BASE_FARE} 
                                    onChange={(e) => updateField('NIGHT_BASE_FARE', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-indigo-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="night_unit" className="text-zinc-400 text-xs font-bold uppercase">Precio por cada 100m ($)</Label>
                                <Input 
                                    id="night_unit"
                                    type="number" 
                                    value={config?.NIGHT_PRICE_PER_100M} 
                                    onChange={(e) => updateField('NIGHT_PRICE_PER_100M', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-indigo-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="night_wait" className="text-zinc-400 text-xs font-bold uppercase">Minuto de Espera ($)</Label>
                                <Input 
                                    id="night_wait"
                                    type="number" 
                                    value={config?.NIGHT_WAITING_PER_MIN} 
                                    onChange={(e) => updateField('NIGHT_WAITING_PER_MIN', e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white text-lg font-bold focus:ring-indigo-500/50"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mr-auto">
                        Última actualización: {config?.version ? `V${config.version}` : 'Inicial'}
                    </p>
                    <Button 
                        type="submit" 
                        disabled={saving}
                        className="h-14 px-10 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-[0.98]"
                    >
                        {saving ? (
                            <>
                                <VamoIcon name="loader" className="mr-2 h-5 w-5 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <VamoIcon name="save" className="mr-2 h-5 w-5" />
                                Guardar Tarifas de {profile?.city}
                            </>
                        )}
                    </Button>
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
