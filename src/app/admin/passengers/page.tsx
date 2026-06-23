'use client';

import React, { useState, useEffect } from 'react';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs, 
    startAfter,
    DocumentSnapshot 
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { VamoIcon } from '@/components/VamoIcon';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { BroadcastDialog } from '@/components/admin/BroadcastDialog';
import { Loader2 } from 'lucide-react';

const PAGE_SIZE = 15;

type PassengerRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  createdAt?: any;
};

export default function AdminPassengersPage() {
  const firestore = useFirestore();
  const { profile } = useUser();

  // Data State
  const [passengers, setPassengers] = useState<PassengerRow[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  
  // UI State
  const { cityKey: activeCityKey, loading: loadingContext } = useMunicipalContext();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!firestore || profile?.role !== 'admin' || loadingContext) return;
    initialLoad();
  }, [firestore, profile, activeCityKey, loadingContext]);

  const initialLoad = async () => {
    setLoading(true);
    setError(null);
    setPassengers([]);
    setLastDoc(null);
    setHasMore(true);
    await fetchPassengers(null);
    setLoading(false);
  };

  const fetchPassengers = async (afterDoc: DocumentSnapshot | null) => {
    if (!firestore) return;
    try {
      let q = query(
        collection(firestore, 'users'),
        where('role', '==', 'passenger'),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );

      if (activeCityKey && activeCityKey !== 'global') {
        q = query(q, where('cityKey', '==', activeCityKey));
      }

      if (afterDoc) {
        q = query(q, startAfter(afterDoc));
      }

      const snapshot = await getDocs(q);
      const newDocs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PassengerRow[];

      if (newDocs.length < PAGE_SIZE) setHasMore(false);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);

      if (afterDoc) {
        setPassengers(prev => [...prev, ...newDocs]);
      } else {
        setPassengers(newDocs);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error cargando pasajeros.');
    }
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchPassengers(lastDoc);
    setLoadingMore(false);
  };

  // Filtrado local básico para búsqueda (en un escenario real, requeriría Algolia o similar)
  const filteredPassengers = passengers.filter(p => {
      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase();
      return (
          p.name?.toLowerCase().includes(term) ||
          p.email?.toLowerCase().includes(term) ||
          p.phone?.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term)
      );
  });

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
                <h1 className="text-3xl font-black">Pasajeros</h1>
                <p className="text-muted-foreground">Gestión y visualización de pasajeros registrados.</p>
            </div>
            <div className="flex flex-col items-end gap-2">
                <BroadcastDialog targetRole="passenger" cityKey={activeCityKey || 'global'} />
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    {passengers.length} cargados {hasMore ? '(más disponibles)' : '(total)'}
                </div>
            </div>
        </div>

        {/* FILTERS & SEARCH */}
        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
            <CardContent className="pt-6 flex gap-4">
                <div className="flex-1 relative">
                    <VamoIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input 
                        placeholder="Buscar por nombre, teléfono o ID..." 
                        className="pl-10 bg-zinc-900/50 border-zinc-800 focus:ring-primary"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </CardContent>
        </Card>

        {/* TABLE AREA */}
        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        <tr>
                            <th className="px-6 py-4">Pasajero</th>
                            <th className="px-6 py-4">Contacto</th>
                            <th className="px-6 py-4">Fecha de Registro</th>
                            <th className="px-6 py-4 text-right">ID</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                        {error ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-red-400">{error}</td></tr>
                        ) : filteredPassengers.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-zinc-500">No se encontraron pasajeros.</td></tr>
                        ) : (
                            filteredPassengers.map(p => (
                                <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-9 w-9 bg-zinc-800 border border-zinc-700">
                                                <AvatarImage src={p.photoURL} />
                                                <AvatarFallback className="bg-zinc-800 text-zinc-400 font-black">
                                                    {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-bold text-white">{p.name || 'Sin Nombre'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-zinc-300 text-xs">
                                                <VamoIcon name="mail" className="w-3 h-3 text-zinc-500" />
                                                {p.email || 'Sin email'}
                                            </div>
                                            <div className="flex items-center gap-2 text-zinc-400 text-xs">
                                                <VamoIcon name="phone" className="w-3 h-3 text-zinc-600" />
                                                {p.phone || 'Sin teléfono'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-400 text-xs">
                                        {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : 'Desconocida'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{p.id.slice(0,8)}</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            {hasMore && (
                <div className="p-4 border-t border-zinc-800 flex justify-center bg-zinc-900/30">
                    <Button 
                        variant="ghost" 
                        onClick={handleLoadMore} 
                        disabled={loadingMore}
                        className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white"
                    >
                        {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cargar más pasajeros'}
                    </Button>
                </div>
            )}
        </Card>
    </div>
  );
}
