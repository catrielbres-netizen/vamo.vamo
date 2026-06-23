'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore, useFunctions } from '@/firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { City, CityStatus } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import PlaceAutocompleteInput from '@/components/PlaceAutocompleteInput';
import { CITIES } from '@/lib/cityData';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
export default function ExpansionDashboardPage() {
    const firestore = useFirestore();
    const functions = useFunctions();
    const { profile } = useUser();
    const { toast } = useToast();
    const router = useRouter();
    const [cities, setCities] = useState<City[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    const [creatingCity, setCreatingCity] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [processedInvites, setProcessedInvites] = useState<Record<string, string>>({});
    
    const [newExpansionCity, setNewExpansionCity] = useState({
        name: '',
        province: '',
        country: 'Argentina',
        targetApprovedDrivers: 50,
        estimatedLaunchDate: ''
    });

    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [updatingCity, setUpdatingCity] = useState(false);
    const [updateCityData, setUpdateCityData] = useState<{
        cityKey: string;
        name: string;
        targetApprovedDrivers: number;
        estimatedLaunchDate: string;
        operationalStatus: string;
        passengerAccessEnabled: boolean;
        passengerMarketingEnabled: boolean;
        _originalPassengerEnabled: boolean;
        _originalStatus: string;
        _currentApprovedDrivers: number;
    } | null>(null);

    useEffect(() => {
        if (!firestore) return;
        
        // Cargar las invitaciones para poder obtener los tokens
        const qInvites = query(collection(firestore, 'municipal_onboarding_invites'));
        const unsubscribeInvites = onSnapshot(qInvites, (snap) => {
            const map: Record<string, string> = {};
            snap.docs.forEach(d => {
                const data = d.data();
                map[data.cityKey] = data.onboardingUrl;
            });
            setProcessedInvites(map);
        });

        return () => unsubscribeInvites();
    }, [firestore]);
    const [newCity, setNewCity] = useState({
        cityKey: '',
        name: '',
        province: '',
        adminEmail: ''
    });

    useEffect(() => {
        if (!firestore) return;
        
        const q = query(collection(firestore, 'cities'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as City));
            setCities(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [firestore]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!functions) return;
        
        setInviting(true);
        try {
            const inviteMunicipality = httpsCallable(functions, 'inviteMunicipalityV1');
            const result: any = await inviteMunicipality(newCity);
            
            toast({
                title: "🏛️ Municipio Invitado",
                description: `Se ha generado el acceso oficial para ${newCity.name}.`,
            });
            
            // Si el backend devuelve un link, podríamos mostrarlo aquí
            if (result.data?.onboardingLink) {
                console.log("Onboarding Link:", result.data.onboardingLink);
            }
            
            setNewCity({ cityKey: '', name: '', province: '', adminEmail: '' });
        } catch (error: any) {
            console.error("Error inviting city:", error);
            toast({
                title: "Error",
                description: error.message || "No se pudo invitar al municipio.",
                variant: "destructive"
            });
        } finally {
            setInviting(false);
        }
    };

    const handleCreateCity = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!functions) return;
        
        setCreatingCity(true);
        try {
            const createExpansionCity = httpsCallable(functions, 'createExpansionCityV1');
            await createExpansionCity(newExpansionCity);
            
            toast({
                title: "✅ Ciudad Creada",
                description: `Se ha creado ${newExpansionCity.name} exitosamente.`,
            });
            
            setNewExpansionCity({ name: '', province: '', country: 'Argentina', targetApprovedDrivers: 50, estimatedLaunchDate: '' });
            setIsCreateModalOpen(false);
        } catch (error: any) {
            console.error("Error creating city:", error);
            toast({
                title: "Error al crear ciudad",
                description: error.message || "No se pudo crear la ciudad.",
                variant: "destructive"
            });
        } finally {
            setCreatingCity(false);
        }
    };

    const handleUpdateCity = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!functions || !updateCityData) return;
        
        // --- PROTECCIÓN DE SEGURIDAD ---
        const isActivatingPassengers = !updateCityData._originalPassengerEnabled && updateCityData.passengerAccessEnabled;
        const isActivatingStatus = updateCityData._originalStatus !== 'active' && updateCityData.operationalStatus === 'active';
        
        if (isActivatingPassengers || isActivatingStatus) {
            const hasEnoughDrivers = updateCityData._currentApprovedDrivers >= updateCityData.targetApprovedDrivers;
            
            if (!hasEnoughDrivers) {
                const confirm1 = window.confirm(`⚠️ PELIGRO: Esta ciudad todavía no alcanzó la meta de conductores aprobados (${updateCityData._currentApprovedDrivers} de ${updateCityData.targetApprovedDrivers}). ¿Querés activarla igual?`);
                if (!confirm1) return;
            }
            
            const confirm2 = window.confirm("Estás por activar acceso a pasajeros o estado Activo en esta ciudad. Esto permitirá que los usuarios intenten pedir viajes reales. ¿Confirmás bajo tu responsabilidad?");
            if (!confirm2) return;
        }
        // ---------------------------------

        setUpdatingCity(true);
        try {
            const updateExpansionCity = httpsCallable(functions, 'updateExpansionCityV1');
            await updateExpansionCity(updateCityData);
            
            toast({
                title: "✅ Ciudad Actualizada",
                description: `Se han guardado los cambios para ${updateCityData.name}.`,
            });
            
            setIsUpdateModalOpen(false);
        } catch (error: any) {
            console.error("Error updating city:", error);
            toast({
                title: "Error al actualizar ciudad",
                description: error.message || "No se pudieron guardar los cambios.",
                variant: "destructive"
            });
        } finally {
            setUpdatingCity(false);
        }
    };

    if (loading) return (
        <div className="p-20 flex flex-col items-center justify-center gap-4">
            <VamoIcon name="loader" className="h-8 w-8 text-primary animate-spin" />
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Cargando red nacional...</p>
        </div>
    );

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-tighter">VamO Global</div>
                    </div>
                    <div className="flex items-center gap-4">
                        <h1 className="text-4xl font-black text-white tracking-tighter">Expansión Hub</h1>
                        <Button 
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs h-9 rounded-xl shadow-lg shadow-emerald-500/20"
                        >
                            <VamoIcon name="plus" className="h-4 w-4 mr-1.5" />
                            Crear Ciudad
                        </Button>
                    </div>
                    <p className="text-zinc-500 font-medium mt-1">Gestioná el desembarco de VamO en nuevas ciudades del país.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <p className="text-2xl font-black text-white leading-none">{cities.length}</p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ciudades en Red</p>
                    </div>
                    <div className="h-10 w-px bg-white/5 mx-2" />
                    <VamoIcon name="globe" className="h-8 w-8 text-indigo-500/20" />
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* PANEL DE INVITACIÓN */}
                <div className="lg:col-span-4 space-y-6">
                    <Card className="bg-black/40 backdrop-blur-xl border-zinc-800 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <VamoIcon name="landmark" className="h-32 w-32 text-white" />
                        </div>
                        <CardHeader>
                            <CardTitle className="text-xl font-black text-white">Nueva Jurisdicción</CardTitle>
                            <CardDescription className="text-zinc-500">
                                Invitá a un municipio para que configure sus propias tarifas y habilitaciones.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleInvite} className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">Buscar Localidad</label>
                                    <div className="h-12 flex items-center rounded-xl bg-white/[0.03] border border-white/10 text-white overflow-hidden focus-within:bg-indigo-500/10 focus-within:border-indigo-500/30 transition-all px-1">
                                        <PlaceAutocompleteInput
                                            placeholder="Ciudad, Provincia..."
                                            iconName="search"
                                            onPlaceSelect={(place) => {
                                                if (place?.city) {
                                                    const key = place.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
                                                    setNewCity({
                                                        ...newCity,
                                                        name: place.city,
                                                        cityKey: key,
                                                        province: place.address?.split(',').slice(-2, -1)[0]?.trim() || ''
                                                    });
                                                } else if (place?.address) {
                                                    const cityName = place.address.split(',')[0].trim();
                                                    const key = cityName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
                                                    setNewCity({
                                                        ...newCity,
                                                        name: cityName,
                                                        cityKey: key,
                                                        province: place.address?.split(',').slice(-2, -1)[0]?.trim() || ''
                                                    });
                                                }
                                            }}
                                            className="w-full"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-zinc-600 tracking-tighter ml-1">ID (cityKey)</label>
                                        <Input 
                                            value={newCity.cityKey}
                                            placeholder="ej: lago-puelo"
                                            onChange={e => setNewCity({...newCity, cityKey: e.target.value})}
                                            className="h-10 bg-black/50 border-white/5 text-zinc-300 text-xs font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-zinc-600 tracking-tighter ml-1">Provincia</label>
                                        <Input 
                                            value={newCity.province}
                                            placeholder="Chubut"
                                            onChange={e => setNewCity({...newCity, province: e.target.value})}
                                            className="h-10 bg-black/50 border-white/5 text-zinc-300 text-xs font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">Email Gubernamental</label>
                                    <Input 
                                        type="email"
                                        placeholder="transporte@municipio.gov.ar"
                                        value={newCity.adminEmail}
                                        onChange={e => setNewCity({...newCity, adminEmail: e.target.value})}
                                        className="h-12 bg-white/[0.03] border-white/10 text-white rounded-xl focus:ring-primary"
                                        required
                                    />
                                </div>
                                
                                <Button 
                                    type="submit" 
                                    disabled={inviting || !newCity.cityKey}
                                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                                >
                                    {inviting ? (
                                        <VamoIcon name="loader" className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <>
                                            <VamoIcon name="send" className="h-4 w-4 mr-2" />
                                            Enviar Invitación
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex gap-3">
                        <VamoIcon name="shield-check" className="h-5 w-5 text-amber-500/50 shrink-0" />
                        <p className="text-[10px] text-amber-200/60 leading-tight font-medium">
                            Al enviar la invitación, se crea un perfil municipal inactivo. El sistema enviará automáticamente las credenciales de acceso al correo electrónico proporcionado.
                        </p>
                    </div>
                </div>

                {/* LISTA DE CIUDADES */}
                <div className="lg:col-span-8 space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-xs font-black uppercase text-zinc-500 tracking-widest">Mapa de Despliegue</h2>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-600 uppercase">
                            <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Activa</div>
                            <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Invitada</div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {cities.length === 0 ? (
                            <div className="col-span-2 py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl">
                                <VamoIcon name="map" className="h-12 w-12 text-zinc-800 mx-auto mb-3" />
                                <p className="text-zinc-600 font-bold uppercase text-xs">No hay ciudades registradas aún.</p>
                            </div>
                        ) : (
                            cities.map(city => {
                                const effectiveStatus = city.operationalStatus || (CITIES[city.cityKey]?.status === 'draft' ? 'draft' : city.status);
                                const isRecruiting = effectiveStatus === 'recruiting_drivers';
                                const rec = city.driverRecruitment;
                                const passenger = city.passengerAccess;
                                const progress = rec && rec.targetApprovedDrivers > 0 
                                    ? Math.min(100, Math.round(((rec.approvedDriversCount || 0) / rec.targetApprovedDrivers) * 100))
                                    : 0;
                                    
                                return (
                                <Card key={city.cityKey} className="group bg-zinc-900/40 border-zinc-800 hover:border-indigo-500/30 transition-all relative overflow-hidden">
                                     {/* Background Decor */}
                                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                                        <VamoIcon name="globe" className="h-24 w-24 text-white" />
                                    </div>
                                    
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-xl font-black text-white tracking-tight">{city.name}</h3>
                                                    <div className={cn(
                                                        "h-2 w-2 rounded-full",
                                                        effectiveStatus === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                                                        : effectiveStatus === 'invited' ? 'bg-amber-500'
                                                        : isRecruiting ? 'bg-indigo-500'
                                                        : 'bg-zinc-700'
                                                    )} />
                                                </div>
                                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">{city.province || 'Provincia no def.'}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                {passenger?.enabled ? (
                                                    <div className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Pasajeros: SÍ</div>
                                                ) : (
                                                    <div className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-widest">Pasajeros: NO</div>
                                                )}
                                                {passenger?.marketingEnabled && (
                                                    <div className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest">Ads ON</div>
                                                )}
                                                {effectiveStatus === 'ready_for_passengers' && (
                                                    <div className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest animate-pulse">
                                                        LISTA PUBLICIDAD
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4 relative z-10">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-zinc-600 uppercase">Estado Operativo</span>
                                                    <span className={cn(
                                                        "text-xs font-black uppercase tracking-widest",
                                                        effectiveStatus === 'active' ? 'text-emerald-400' 
                                                        : effectiveStatus === 'invited' ? 'text-amber-500'
                                                        : isRecruiting ? 'text-indigo-400'
                                                        : 'text-zinc-500'
                                                    )}>
                                                        {effectiveStatus === 'recruiting_drivers' ? 'Reclutando Conductores' : 
                                                         effectiveStatus === 'ready_for_passengers' ? 'Lista Para Publicidad' : 
                                                         effectiveStatus}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-bold text-zinc-600 uppercase">Lanzamiento Est.</span>
                                                    <span className="text-xs font-black text-zinc-300">
                                                        {rec?.estimatedLaunchDate ? new Date(rec.estimatedLaunchDate).toLocaleDateString() : 'A confirmar'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Recruitment Progress */}
                                            {rec && (
                                                <div className="pt-4 border-t border-white/5 space-y-3">
                                                    <div className="flex justify-between items-end">
                                                        <div>
                                                            <p className="text-xl font-black text-white leading-none">
                                                                {rec.approvedDriversCount || 0} <span className="text-sm text-zinc-500 font-bold">/ {rec.targetApprovedDrivers}</span>
                                                            </p>
                                                            <p className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest mt-1">Aprobados</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-lg font-black text-indigo-400">{progress}%</p>
                                                        </div>
                                                    </div>
                                                    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                                                    </div>
                                                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                                                        <span>{rec.registeredDriversCount || 0} Registrados</span>
                                                        <span>{rec.pendingDriversCount || 0} Pendientes</span>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-black uppercase text-zinc-600 tracking-tighter">Admin Email</span>
                                                    <span className="text-sm font-medium text-zinc-300 truncate">{city.adminEmail || 'No asig.'}</span>
                                                </div>
                                                
                                                <div className="flex items-center gap-2">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => {
                                                            setUpdateCityData({
                                                                cityKey: city.cityKey,
                                                                name: city.name,
                                                                targetApprovedDrivers: rec?.targetApprovedDrivers || 50,
                                                                estimatedLaunchDate: rec?.estimatedLaunchDate || '',
                                                                operationalStatus: effectiveStatus,
                                                                passengerAccessEnabled: passenger?.enabled || false,
                                                                passengerMarketingEnabled: passenger?.marketingEnabled || false,
                                                                _originalPassengerEnabled: passenger?.enabled || false,
                                                                _originalStatus: effectiveStatus,
                                                                _currentApprovedDrivers: rec?.approvedDriversCount || 0
                                                            });
                                                            setIsUpdateModalOpen(true);
                                                        }}
                                                        className="h-8 text-[10px] font-black uppercase tracking-widest border-indigo-500/30 text-indigo-400 hover:text-indigo-300 transition-all bg-indigo-500/10 hover:bg-indigo-500/20"
                                                    >
                                                        <VamoIcon name="settings" className="h-3 w-3 mr-1" />
                                                        Configurar
                                                    </Button>
                                                    {rec && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            onClick={async () => {
                                                                try {
                                                                    const call = httpsCallable(functions, 'recalculateCityRecruitmentStatsV1');
                                                                    await call({ cityKey: city.cityKey });
                                                                    toast({ title: "Recalculado", description: "Estadísticas actualizadas." });
                                                                } catch (e: any) {
                                                                    toast({ variant: "destructive", title: "Error", description: e.message });
                                                                }
                                                            }}
                                                            className="h-8 text-[10px] font-black uppercase tracking-widest border-white/10 text-zinc-400 hover:text-white transition-all"
                                                        >
                                                            <VamoIcon name="refresh" className="h-3 w-3 mr-1" />
                                                            Recalcular
                                                        </Button>
                                                    )}
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => router.push(`/admin/cities/${city.cityKey}`)}
                                                        className="h-8 text-[10px] font-black uppercase tracking-widest border-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all bg-emerald-500/10 hover:bg-emerald-500/20"
                                                    >
                                                        <VamoIcon name="bar-chart-2" className="h-3 w-3 mr-1" />
                                                        Auditar
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
            
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Crear Nueva Ciudad</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Inicializa una nueva jurisdicción en fase de reclutamiento de conductores.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <form onSubmit={handleCreateCity} className="space-y-4 mt-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Nombre de la Ciudad</label>
                            <Input 
                                required
                                value={newExpansionCity.name}
                                onChange={e => setNewExpansionCity({...newExpansionCity, name: e.target.value})}
                                placeholder="Ej: Caleta Olivia"
                                className="bg-white/5 border-white/10 text-white"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Provincia</label>
                                <Input 
                                    required
                                    value={newExpansionCity.province}
                                    onChange={e => setNewExpansionCity({...newExpansionCity, province: e.target.value})}
                                    placeholder="Ej: Santa Cruz"
                                    className="bg-white/5 border-white/10 text-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">País</label>
                                <Input 
                                    required
                                    value={newExpansionCity.country}
                                    onChange={e => setNewExpansionCity({...newExpansionCity, country: e.target.value})}
                                    className="bg-white/5 border-white/10 text-zinc-400"
                                    readOnly
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Meta Cond.</label>
                                <Input 
                                    required
                                    type="number"
                                    min="1"
                                    value={newExpansionCity.targetApprovedDrivers}
                                    onChange={e => setNewExpansionCity({...newExpansionCity, targetApprovedDrivers: parseInt(e.target.value) || 50})}
                                    className="bg-white/5 border-white/10 text-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Lanzamiento Est.</label>
                                <Input 
                                    type="date"
                                    value={newExpansionCity.estimatedLaunchDate}
                                    onChange={e => setNewExpansionCity({...newExpansionCity, estimatedLaunchDate: e.target.value})}
                                    className="bg-white/5 border-white/10 text-white"
                                />
                            </div>
                        </div>
                        
                        <div className="p-3 mt-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-medium">
                            <VamoIcon name="info" className="inline-block w-3 h-3 mr-1" />
                            La ciudad iniciará automáticamente en estado "Reclutando Conductores" con el acceso a pasajeros y publicidad desactivados.
                        </div>

                        <Button 
                            type="submit" 
                            disabled={creatingCity || !newExpansionCity.name || !newExpansionCity.province}
                            className="w-full h-12 mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest"
                        >
                            {creatingCity ? "Creando..." : "Confirmar Creación"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isUpdateModalOpen} onOpenChange={setIsUpdateModalOpen}>
                <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Configurar Ciudad</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Modificá los parámetros operativos de {updateCityData?.name}.
                        </DialogDescription>
                    </DialogHeader>
                    
                    {updateCityData && (
                        <form onSubmit={handleUpdateCity} className="space-y-4 mt-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Estado Operativo</label>
                                <select 
                                    className="w-full h-10 bg-white/5 border border-white/10 rounded-md px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={updateCityData.operationalStatus}
                                    onChange={(e) => setUpdateCityData({ ...updateCityData, operationalStatus: e.target.value })}
                                >
                                    <option value="draft" className="bg-zinc-900">Borrador</option>
                                    <option value="invited" className="bg-zinc-900">Invitada</option>
                                    <option value="recruiting_drivers" className="bg-zinc-900">Reclutando Conductores</option>
                                    <option value="ready_for_passengers" className="bg-zinc-900">Lista para Publicidad</option>
                                    <option value="active" className="bg-zinc-900">Activa (Total)</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Meta Cond.</label>
                                    <Input 
                                        required
                                        type="number"
                                        min="1"
                                        value={updateCityData.targetApprovedDrivers}
                                        onChange={e => setUpdateCityData({...updateCityData, targetApprovedDrivers: parseInt(e.target.value) || 50})}
                                        className="bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Lanzamiento</label>
                                    <Input 
                                        type="date"
                                        value={updateCityData.estimatedLaunchDate}
                                        onChange={e => setUpdateCityData({...updateCityData, estimatedLaunchDate: e.target.value})}
                                        className="bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-white/10">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest block">Acceso Pasajeros</label>
                                
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={cn(
                                        "w-12 h-6 rounded-full transition-colors relative",
                                        updateCityData.passengerAccessEnabled ? "bg-emerald-500" : "bg-zinc-800"
                                    )}>
                                        <div className={cn(
                                            "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                                            updateCityData.passengerAccessEnabled ? "left-7" : "left-1"
                                        )} />
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="hidden" 
                                        checked={updateCityData.passengerAccessEnabled}
                                        onChange={(e) => setUpdateCityData({...updateCityData, passengerAccessEnabled: e.target.checked})}
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">Habilitar App para Pasajeros</span>
                                        <span className="text-[10px] text-zinc-500 leading-tight">Si está inactivo, los pasajeros verán la pantalla de "Próximamente".</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={cn(
                                        "w-12 h-6 rounded-full transition-colors relative",
                                        updateCityData.passengerMarketingEnabled ? "bg-indigo-500" : "bg-zinc-800"
                                    )}>
                                        <div className={cn(
                                            "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                                            updateCityData.passengerMarketingEnabled ? "left-7" : "left-1"
                                        )} />
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="hidden" 
                                        checked={updateCityData.passengerMarketingEnabled}
                                        onChange={(e) => setUpdateCityData({...updateCityData, passengerMarketingEnabled: e.target.checked})}
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">Permitir Publicidad (Marketing)</span>
                                        <span className="text-[10px] text-zinc-500 leading-tight">Activa cupones y links de afiliados para usuarios.</span>
                                    </div>
                                </label>
                            </div>

                            <Button 
                                type="submit" 
                                disabled={updatingCity}
                                className="w-full h-12 mt-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest"
                            >
                                {updatingCity ? "Guardando..." : "Guardar Cambios"}
                            </Button>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

