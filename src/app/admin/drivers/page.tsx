'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
    collection, 
    query, 
    where, 
    orderBy, 
    getDocs
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { isDriverReadyForReview } from '@/lib/eligibility';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { BroadcastDialog } from '@/components/admin/BroadcastDialog';


type DriverRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  approved?: boolean;
  isSuspended?: boolean;
  serviceTier?: 'express' | 'premium';
  servicesOffered?: {
    express?: boolean;
    premium?: boolean;
  };
  currentBalance?: number;
  photoURL?: string;
  createdAt?: any;
};

export default function AdminDriversPage() {
  const firestore = useFirestore();
  const { profile } = useUser();

  // Data State
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  
  // UI State
  const { cityKey: activeCityKey, loading: loadingContext } = useMunicipalContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!firestore || profile?.role !== 'admin' || loadingContext) return;
    initialLoad();
  }, [firestore, profile, activeCityKey, loadingContext]); // Removed filterStatus from dependency array to not re-fetch

  const initialLoad = async () => {
    setLoading(true);
    setError(null);
    setDrivers([]);
    await fetchDrivers();
    setLoading(false);
  };

  const fetchDrivers = async () => {
    if (!firestore) return;
    try {
      let q = query(
        collection(firestore, 'users'),
        where('role', '==', 'driver'),
        orderBy('createdAt', 'desc')
      );

      const isGlobalMode = activeCityKey === 'all' || activeCityKey === '*' || activeCityKey === 'global' || !activeCityKey;

      if (!isGlobalMode && activeCityKey) {
        q = query(q, where('cityKey', '==', activeCityKey));
      }

      const snap = await getDocs(q);
      if (snap.empty) {
        setDrivers([]);
        return;
      }

      // Filtrar usuarios de prueba y registros incompletos en el cliente
      const isTestUser = (data: any) => {
        const email = data.email?.toLowerCase() || '';
        return email.includes('test') || email.includes('demo') || data.isTestUser === true;
      };

      let newList = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as DriverRow))
        .filter(d => !isTestUser(d))
        .filter(d => {
            // [VamO REGLA] No mostrar en admin a quienes no completaron el registro inicial
            const data = d as any;
            if (data.onboardingIncomplete === true || data.profileCompleted === false) return false;
            if (!data.name || data.name.trim() === '') return false; // "Sin nombre" prevent
            return true;
        });

      setDrivers(newList);
    } catch (err: any) {
      console.error("Error fetching drivers:", err);
      if (err?.message?.includes('index')) {
          setError("Falta un índice en la base de datos para este filtro. Por favor, contacte a soporte (soporte.vamo@gmail.com).");
      } else {
          setError("Error al cargar conductores. Por favor, intente de nuevo.");
      }
    }
  };

  // Client-side search & unified filtering
  const displayedDrivers = useMemo(() => {
    let list = drivers;

    // Apply strict filters based on filterStatus
    if (filterStatus === 'pending') {
      list = list.filter(d => d.approved === false && isDriverReadyForReview(d));
    } else if (filterStatus === 'approved') {
      list = list.filter(d => d.approved === true);
    } else if (filterStatus === 'suspended') {
      list = list.filter(d => d.isSuspended === true);
    }

    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(d => 
        (d.name || '').toLowerCase().includes(q) || 
        (d.phone || '').includes(q) || 
        (d.email || '').toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q)
    );
  }, [drivers, filterStatus, searchQuery]);

  function formatMoney(value?: number) {
    if (typeof value !== 'number') return '$0';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function serviceLabel(driver: DriverRow) {
    const tier = driver.serviceTier || 'sin definir';
    const express = driver.servicesOffered?.express === true;
    const premium = driver.servicesOffered?.premium === true;

    if (tier === 'express') return 'Express';
    if (tier === 'premium' && express) return 'Premium + Express';
    if (tier === 'premium') return 'Premium';
    if (premium && express) return 'Premium + Express';
    if (premium) return 'Premium';
    if (express) return 'Express';
    return 'Sin configurar';
  }

  if (loading) {
    return (
        <div className="p-6 space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-end">
            <div>
                <h1 className="text-3xl font-black">Conductores</h1>
                <p className="text-muted-foreground">Gestión de flota, aprobación y balances.</p>
            </div>
            <div className="flex flex-col items-end gap-2">
                <BroadcastDialog targetRole="driver" cityKey={activeCityKey || 'global'} />
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    {displayedDrivers.length} listados de {drivers.length} total
                </div>
            </div>
        </div>

        {/* FILTERS & SEARCH */}
        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
            <CardContent className="pt-6 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <VamoIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input 
                        placeholder="Buscar por nombre, teléfono o ID..." 
                        className="pl-10 bg-zinc-900/50 border-zinc-800 focus:ring-primary"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full md:w-[220px] bg-zinc-900/50 border-zinc-800">
                        <SelectValue placeholder="Estado de Aprobación" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all">Todos los conductores</SelectItem>
                        <SelectItem value="pending">⏳ Pendientes</SelectItem>
                        <SelectItem value="approved">✅ Aprobados</SelectItem>
                        <SelectItem value="suspended">🚫 Suspendidos</SelectItem>
                    </SelectContent>
                </Select>
            </CardContent>
        </Card>

        {/* TABLE AREA */}
        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        <tr>
                            <th className="px-6 py-4">Conductor</th>
                            <th className="px-6 py-4">Estado / Cuenta</th>
                            <th className="px-6 py-4">Servicio</th>
                            <th className="px-6 py-4">Saldo</th>
                            <th className="px-6 py-4 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                        {error ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <VamoIcon name="alert-circle" className="h-8 w-8 text-rose-500" />
                                        <p className="text-zinc-400 font-medium">{error}</p>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={initialLoad}
                                            className="text-primary hover:text-primary/80"
                                        >
                                            Reintentar
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ) : displayedDrivers.length > 0 ? (
                            displayedDrivers.map((driver) => (
                                <tr key={driver.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10 border border-zinc-800">
                                                <AvatarImage src={driver.photoURL || undefined} />
                                                <AvatarFallback className="bg-zinc-800 text-zinc-400">
                                                    {driver.name ? driver.name.charAt(0).toUpperCase() : '?'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-bold text-white">{driver.name || 'Sin nombre'}</div>
                                                <div className="text-[10px] text-zinc-500 font-medium">{driver.phone || driver.email || 'Sin contacto'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                {driver.approved ? (
                                                    <span className="flex items-center gap-1 text-[10px] font-black text-green-500 uppercase tracking-tighter">
                                                        <VamoIcon name="check-circle" className="h-3 w-3" /> Aprobado
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-tighter">
                                                        <VamoIcon name="clock" className="h-3 w-3" /> Pendiente
                                                    </span>
                                                )}
                                            </div>
                                            {driver.isSuspended && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-[9px] font-bold uppercase border border-red-500/20 w-fit">
                                                    🚫 Suspendido
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-medium bg-zinc-800/50 px-2 py-1 rounded-lg border border-zinc-700/50">
                                            {serviceLabel(driver)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={cn(
                                            "font-black",
                                            (driver.currentBalance || 0) < 0 ? "text-red-400" : "text-white"
                                        )}>
                                            {formatMoney(driver.currentBalance)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/admin/driver-detail?id=${driver.id}`}>
                                            <Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-zinc-800">
                                                Detalles <VamoIcon name="chevron-right" className="ml-2 h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="px-6 py-20 text-center text-zinc-500 italic">
                                    No se encontraron conductores con estos filtros.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    </div>
  );
}
