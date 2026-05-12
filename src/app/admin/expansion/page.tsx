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

export default function ExpansionDashboardPage() {
    const firestore = useFirestore();
    const functions = useFunctions();
    const { profile } = useUser();
    const { toast } = useToast();
    
    const [cities, setCities] = useState<City[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    const [processedInvites, setProcessedInvites] = useState<Record<string, string>>({});

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
                    <h1 className="text-4xl font-black text-white tracking-tighter">Expansión Hub</h1>
                    <p className="text-zinc-500 font-medium">Gestioná el desembarco de VamO en nuevas ciudades del país.</p>
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
                            cities.map(city => (
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
                                                        city.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                                                        : city.status === 'invited' ? 'bg-amber-500'
                                                        : 'bg-zinc-700'
                                                    )} />
                                                </div>
                                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">{city.province || 'Provincia no def.'}</p>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                                                <VamoIcon name="building" className="h-4 w-4 text-zinc-500" />
                                            </div>
                                        </div>

                                        <div className="space-y-3 relative z-10">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] font-black uppercase text-zinc-600 tracking-tighter">Admin Municipal</span>
                                                <span className="text-sm font-medium text-zinc-300 truncate">{city.adminEmail}</span>
                                            </div>
                                            
                                            <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-zinc-600 uppercase">Estado</span>
                                                    <span className={cn(
                                                        "text-xs font-black uppercase tracking-widest",
                                                        city.status === 'active' ? 'text-emerald-400' 
                                                        : city.status === 'invited' ? 'text-amber-500'
                                                        : 'text-zinc-500'
                                                    )}>
                                                        {city.status}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-3 w-full">
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-zinc-600 uppercase">Estado</span>
                                                            <span className={cn(
                                                                "text-xs font-black uppercase tracking-widest",
                                                                city.status === 'active' ? 'text-emerald-400' 
                                                                : city.status === 'invited' ? 'text-amber-500'
                                                                : 'text-zinc-500'
                                                            )}>
                                                                {city.status}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {city.status === 'invited' && (processedInvites[city.cityKey] || processedInvites[city.cityKey.toLowerCase()]) ? (
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    onClick={() => {
                                                                        let link = processedInvites[city.cityKey] || processedInvites[city.cityKey.toLowerCase()];
                                                                        // Reemplazo agresivo para desarrollo local
                                                                        if (window.location.hostname === 'localhost') {
                                                                            link = link.replace(/https?:\/\/vamo\.vamo/g, 'http://localhost:3000');
                                                                        }
                                                                        navigator.clipboard.writeText(link);
                                                                        toast({ title: "🔗 Link copiado", description: "Pegalo en WhatsApp para enviarlo al municipio." });
                                                                    }}
                                                                    className="h-8 text-[10px] font-black uppercase tracking-widest border-indigo-500/30 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all shadow-lg shadow-indigo-500/10"
                                                                >
                                                                    Copiar Link
                                                                </Button>
                                                            ) : city.status === 'invited' ? (
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    onClick={async () => {
                                                                        setInviting(true);
                                                                        try {
                                                                            const normalizedKey = city.cityKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
                                                                            const inviteMunicipality = httpsCallable(functions, 'inviteMunicipalityV1');
                                                                            const res: any = await inviteMunicipality({
                                                                                cityKey: normalizedKey,
                                                                                name: city.name,
                                                                                province: city.province,
                                                                                adminEmail: city.adminEmail
                                                                            });
                                                                            if (res.data?.onboardingLink) {
                                                                                setProcessedInvites(prev => ({...prev, [city.cityKey]: res.data.onboardingLink}));
                                                                            }
                                                                            toast({ title: "📩 Invitación generada", description: "El link de onboarding ya está listo." });
                                                                        } catch (e: any) {
                                                                            toast({ variant: "destructive", title: "Error", description: e.message });
                                                                        } finally {
                                                                            setInviting(false);
                                                                        }
                                                                    }}
                                                                    className="h-8 text-[10px] font-black uppercase tracking-widest border-amber-500/30 text-amber-500 hover:bg-amber-500 hover:text-white transition-all"
                                                                >
                                                                    Generar Link
                                                                </Button>
                                                            ) : null}
                                                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white">
                                                                {city.status === 'active' ? 'Gestionar →' : 'Ver Detalles'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    
                                                    {city.status === 'invited' && (processedInvites[city.cityKey] || processedInvites[city.cityKey.toLowerCase()]) && (
                                                        <div className="p-2 rounded bg-black/40 border border-white/5 overflow-hidden">
                                                            <p className="text-[9px] font-mono text-indigo-400/60 break-all select-all">
                                                                {(processedInvites[city.cityKey] || processedInvites[city.cityKey.toLowerCase()]).replace(/https?:\/\/vamo\.vamo/g, process.env.NEXT_PUBLIC_BASE_URL || 'https://vamoapp.online')}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
