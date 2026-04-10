'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore, useFunctions } from '@/firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { City, CityStatus } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function ExpansionDashboardPage() {
    const firestore = useFirestore();
    const functions = useFunctions();
    const { profile } = useUser();
    
    const [cities, setCities] = useState<City[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    
    // Form state
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
                title: "Municipio Invitado",
                description: `Se ha generado el enlace para ${newCity.name}.`,
            });
            
            // Link is in result.data.onboardingLink
            console.log("Onboarding Link:", result.data.onboardingLink);
            
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

    if (loading) return <div className="p-20 text-center text-zinc-500">Cargando mapa de expansión...</div>;

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-black text-white">HUB de Expansión</h1>
                <p className="text-zinc-500 text-sm mt-1">
                    Control central de VamO para nuevas jurisdicciones.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Panel de Invitación */}
                <Card className="p-6 bg-zinc-900/50 border-white/5 space-y-6 flex flex-col">
                    <div className="space-y-1">
                        <h2 className="text-lg font-bold text-white">Invitar Municipio</h2>
                        <p className="text-xs text-zinc-500">Genera una nueva invitación oficial.</p>
                    </div>

                    <form onSubmit={handleInvite} className="space-y-4 flex-1">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">ID Ciudad (cityKey)</label>
                            <Input 
                                placeholder="ej: trelew"
                                value={newCity.cityKey}
                                onChange={e => setNewCity({...newCity, cityKey: e.target.value.toLowerCase()})}
                                className="bg-white/[0.03] border-white/10 text-white"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Nombre Ciudad</label>
                            <Input 
                                placeholder="Trelew"
                                value={newCity.name}
                                onChange={e => setNewCity({...newCity, name: e.target.value})}
                                className="bg-white/[0.03] border-white/10 text-white"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Provincia</label>
                            <Input 
                                placeholder="Chubut"
                                value={newCity.province}
                                onChange={e => setNewCity({...newCity, province: e.target.value})}
                                className="bg-white/[0.03] border-white/10 text-white"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Email Admin Municipal</label>
                            <Input 
                                type="email"
                                placeholder="municipio@trelew.gov.ar"
                                value={newCity.adminEmail}
                                onChange={e => setNewCity({...newCity, adminEmail: e.target.value})}
                                className="bg-white/[0.03] border-white/10 text-white"
                                required
                            />
                        </div>
                        
                        <Button 
                            type="submit" 
                            disabled={inviting}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 font-bold"
                        >
                            {inviting ? "Enviando..." : "Enviar Invitación"}
                        </Button>
                    </form>
                </Card>

                {/* Lista de Ciudades */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-sm font-black uppercase text-zinc-500 tracking-widest pl-1">Red de Ciudades</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {cities.map(city => (
                            <Card key={city.cityKey} className="p-5 bg-zinc-900/50 border-white/5 flex flex-col justify-between hover:border-indigo-500/20 transition-all">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-black text-white">{city.name}</h3>
                                            <span className={cn(
                                                "text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                                                city.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' 
                                                : city.status === 'invited' ? 'bg-amber-500/10 text-amber-400'
                                                : 'bg-zinc-800 text-zinc-500'
                                            )}>
                                                {city.status}
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-mono text-zinc-600 uppercase mt-0.5">{city.province}, {city.country}</p>
                                    </div>
                                    <div className="h-8 w-8 rounded-lg bg-indigo-500/5 flex items-center justify-center">
                                        <VamoIcon name="building" className="h-4 w-4 text-indigo-500/50" />
                                    </div>
                                </div>

                                <div className="mt-6 space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-zinc-600">Admin:</span>
                                        <span className={cn("font-medium", city.adminUserId ? "text-indigo-400" : "text-zinc-500 italic")}>
                                            {city.adminEmail}
                                        </span>
                                    </div>
                                    {city.status === 'invited' && (
                                        <div className="p-2 bg-amber-500/5 rounded border border-amber-500/10">
                                            <p className="text-[10px] text-amber-400 leading-tight">
                                                Enlace de onboarding generado. Esperando registro del municipio.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

