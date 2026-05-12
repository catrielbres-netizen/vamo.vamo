'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { 
    collection, 
    query, 
    getDocs, 
    doc, 
    updateDoc, 
    orderBy, 
    limit, 
    where,
    startAfter,
    getCountFromServer,
    Timestamp,
    DocumentSnapshot
} from 'firebase/firestore';
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from "@/components/ui/card";
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { VamoIcon } from '@/components/VamoIcon';
import { safeFixed } from '@/lib/formatters';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Referral, UserReward, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const PAGE_SIZE = 20;

export default function AdminReferralsPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const { toast } = useToast();

    // Data State
    const [referrals, setReferrals] = useState<any[]>([]);
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [users, setUsers] = useState<Record<string, UserProfile>>({});
    
    // UI State
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Metrics State
    const [metrics, setMetrics] = useState({
        total: 0,
        pending: 0,
        rewarded: 0,
        totalCash: 0,
        percentCount: 0
    });

    useEffect(() => {
        if (!firestore || profile?.role !== 'admin') return;
        initialLoad();
    }, [firestore, profile, filterStatus]);

    const initialLoad = async () => {
        setLoading(true);
        setReferrals([]);
        setLastDoc(null);
        setHasMore(true);
        await Promise.all([
            fetchKPIs(),
            fetchReferrals(null)
        ]);
        setLoading(false);
    };

    const fetchKPIs = async () => {
        if (!firestore) return;
        try {
            const coll = collection(firestore, 'referrals');
            
            // Scalable way to get counts without fetching all docs
            const [totalSnap, pendingSnap, rewardedSnap] = await Promise.all([
                getCountFromServer(query(coll)),
                getCountFromServer(query(coll, where('status', '==', 'pending'))),
                getCountFromServer(query(coll, where('status', '==', 'rewarded')))
            ]);

            // For cash rewards, we still need a query or an aggregation doc.
            // Since aggregates are better in a 'config/metrics' doc, we do a limited fetch here
            // but the user's requirement is "total rewards".
            // Optimization: Fetch only recently rewarded for a sample or keep it limited.
            // PRO APPROACH: We'll fetch the count of rewarded drivers (who get $1000)
            const rewardedDriversSnap = await getCountFromServer(query(coll, where('status', '==', 'rewarded'), where('role', '==', 'driver')));
            const rewardedPassengersSnap = await getCountFromServer(query(coll, where('status', '==', 'rewarded'), where('role', '==', 'passenger')));

            setMetrics({
                total: totalSnap.data().count,
                pending: pendingSnap.data().count,
                rewarded: rewardedSnap.data().count,
                totalCash: rewardedDriversSnap.data().count * 1000,
                percentCount: rewardedPassengersSnap.data().count
            });
        } catch (error) {
            console.error("Error fetching KPIs:", error);
        }
    };

    const fetchReferrals = async (afterDoc: DocumentSnapshot | null) => {
        if (!firestore) return;
        try {
            let q = query(
                collection(firestore, 'referrals'), 
                orderBy('createdAt', 'desc'), 
                limit(PAGE_SIZE)
            );

            if (filterStatus !== 'all') {
                q = query(q, where('status', '==', filterStatus));
            }

            if (afterDoc) {
                q = query(q, startAfter(afterDoc));
            }

            const snap = await getDocs(q);
            if (snap.empty) {
                setHasMore(false);
                return;
            }

            const newList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setLastDoc(snap.docs[snap.docs.length - 1]);
            setHasMore(snap.docs.length === PAGE_SIZE);

            // Fetch users for this chunk only
            await fetchUsersForReferrals(newList);

            if (afterDoc) {
                setReferrals(prev => [...prev, ...newList]);
            } else {
                setReferrals(newList);
            }
        } catch (error) {
            console.error("Error fetching referrals:", error);
            toast({ variant: 'destructive', title: "Error", description: "No se pudieron cargar los referidos." });
        }
    };

    const fetchUsersForReferrals = async (newList: any[]) => {
        if (!firestore) return;
        const uids = new Set<string>();
        newList.forEach(r => {
            if (!users[r.referrerId]) uids.add(r.referrerId);
            if (!users[r.referredId]) uids.add(r.referredId);
        });

        if (uids.size === 0) return;

        const uidArray = Array.from(uids);
        const newUserMap: Record<string, UserProfile> = { ...users };

        for (let i = 0; i < uidArray.length; i += 30) {
            const chunk = uidArray?.slice(i, i + 30) || [];
            const uQuery = query(collection(firestore, 'users'), where('uid', 'in', chunk));
            const uSnap = await getDocs(uQuery);
            uSnap.forEach(d => {
                newUserMap[d.id] = d.data() as UserProfile;
            });
        }
        setUsers(newUserMap);
    };

    const handleLoadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        await fetchReferrals(lastDoc);
        setLoadingMore(false);
    };

    const handleUpdateStatus = async (referralId: string, newStatus: string) => {
        if (!firestore) return;
        
        const confirmMsg = newStatus === 'fraud' 
            ? "¿Estás seguro de marcar este referido como FRAUDE? Se bloquearán beneficios futuros vinculados."
            : "¿Deseas restaurar este referido al estado pendiente?";
            
        if (!window.confirm(confirmMsg)) return;

        setUpdatingId(referralId);
        try {
            await updateDoc(doc(firestore, 'referrals', referralId), { 
                status: newStatus,
                updatedAt: Timestamp.now(),
                updatedBy: profile?.uid 
            });
            toast({ title: "Actualizado", description: `Referido ${newStatus} correctamente.` });
            setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: newStatus } : r));
            // Reload KPIs to reflect change
            fetchKPIs();
        } catch (error) {
            toast({ variant: 'destructive', title: "Error", description: "No se pudo actualizar el estado." });
        } finally {
            setUpdatingId(null);
        }
    };

    // --- FRAUD DETECTION (Efficiently scoped to current view) ---
    // We useMemo to calculate fraud flags only when referrals or users change
    const fraudFlags = useMemo(() => {
        const flags: Record<string, string[]> = {};
        referrals.forEach(r => {
            const referrer = users[r.referrerId];
            const referred = users[r.referredId];
            const alerts: string[] = [];

            if (referrer && referred) {
                if (referrer.phone === referred.phone) alerts.push("Mismo Teléfono");
                if (referrer.email === referred.email) alerts.push("Mismo Email");
                
                // Heuristic: Check if this referrer has too many pending referrals in the CURRENT LOADED LIST
                const referrerReferrals = referrals.filter(x => x.referrerId === r.referrerId);
                if (referrerReferrals.length > 5) alerts.push("Alta Frecuencia (Local)");
            }
            if (alerts.length > 0) flags[r.id] = alerts;
        });
        return flags;
    }, [referrals, users]);

    // Client-side search (limited to loaded items)
    const displayedReferrals = useMemo(() => {
        if (!searchQuery) return referrals;
        const q = searchQuery.toLowerCase();
        return referrals.filter(r => 
            r.id.toLowerCase().includes(q) || 
            r.referrerId.toLowerCase().includes(q) || 
            r.referredId.toLowerCase().includes(q) ||
            users[r.referrerId]?.name?.toLowerCase().includes(q) ||
            users[r.referredId]?.name?.toLowerCase().includes(q)
        );
    }, [referrals, searchQuery, users]);

    if (loading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-10 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-32" />)}
                </div>
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    const conversionRate = metrics.total > 0 ? safeFixed((metrics.rewarded / metrics.total) * 100, 1) : 0;

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <VamoIcon name="users" className="text-primary h-8 w-8" /> Gestión de Referidos
                </h1>
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={initialLoad} disabled={loading}>
                        <VamoIcon name="rotate-ccw" className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                        Sincronizar
                    </Button>
                </div>
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <KPICard title="Total Referidos" value={metrics.total} icon="users" color="blue" />
                <KPICard title="Pendientes" value={metrics.pending} icon="clock" color="amber" />
                <KPICard title="Convertidos" value={metrics.rewarded} icon="check-circle" color="green" />
                <KPICard title="Tasa Conv." value={`${conversionRate}%`} icon="trending-up" color="indigo" />
                <KPICard title="Premios ($)" value={`$${metrics.totalCash.toLocaleString()}`} icon="banknote" color="emerald" subtext={`${metrics.percentCount} cupones 5%`} />
            </div>

            {/* FILTERS */}
            <Card className="border-zinc-800 bg-black/40">
                <CardContent className="pt-6 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <VamoIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        <Input 
                            placeholder="Buscar por nombre o UID en lista actual..." 
                            className="pl-10 bg-zinc-900/50 border-zinc-800"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-full md:w-[220px] bg-zinc-900/50 border-zinc-800">
                            <SelectValue placeholder="Filtrar por Estado" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                            <SelectItem value="all">Todos los estados</SelectItem>
                            <SelectItem value="pending">⏳ Pendiente</SelectItem>
                            <SelectItem value="rewarded">🏆 Premiado</SelectItem>
                            <SelectItem value="fraud">🚫 Marcado como Fraude</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* TABLE */}
            <Card className="border-zinc-800 bg-black/40">
                <CardHeader>
                    <CardTitle>Listado de Referidos</CardTitle>
                    <CardDescription>Mostrando los últimos registros (Paginado).</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-xl border border-zinc-800 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-zinc-900/50">
                                <TableRow className="border-zinc-800 hover:bg-transparent">
                                    <TableHead className="text-zinc-500 font-bold">Referidor</TableHead>
                                    <TableHead className="text-zinc-500 font-bold">Referido</TableHead>
                                    <TableHead className="text-zinc-500 font-bold">Cargo</TableHead>
                                    <TableHead className="text-zinc-500 font-bold">Origen / Campaña</TableHead>
                                    <TableHead className="text-zinc-500 font-bold">Estado</TableHead>
                                    <TableHead className="text-zinc-500 font-bold">Alertas</TableHead>
                                    <TableHead className="text-zinc-500 font-bold">Fecha</TableHead>
                                    <TableHead className="text-right text-zinc-500 font-bold">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {displayedReferrals.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-40 text-center text-zinc-500 italic">
                                            {searchQuery ? "No se encontraron resultados en la página actual." : "No hay datos para mostrar."}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    displayedReferrals.map((r) => (
                                        <TableRow key={r.id} className={cn("border-zinc-800 transition-colors hover:bg-zinc-900/40", r.status === 'fraud' && "opacity-50 grayscale")}>
                                            <TableCell>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-bold text-sm text-white">{users[r.referrerId]?.name || '...'}</span>
                                                    <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[120px]" title={r.referrerId}>
                                                        {r.referrerId?.substring(0, 10) || 'N/A'}...
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-bold text-sm text-zinc-300">{users[r.referredId]?.name || '...'}</span>
                                                    <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[120px]" title={r.referredId}>
                                                        {r.referredId?.substring(0, 10) || 'N/A'}...
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-none capitalize text-[10px] px-1.5 py-0">
                                                    {r.role === 'passenger' ? 'viaje' : 'conduce'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                                                        {r.source === 'link' ? '🔗 Link' : '⌨️ Manual'}
                                                    </span>
                                                    {r.campaign && (
                                                        <span className="text-[9px] text-indigo-400 font-medium">
                                                            {r.campaign}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={r.status} />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {fraudFlags[r.id]?.map((alert, idx) => (
                                                        <Badge key={idx} variant="destructive" className="bg-red-950/40 text-red-500 border-red-500/20 text-[9px] py-0 h-4">
                                                            {alert}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-zinc-500">
                                                {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('es-AR') : '...'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {updatingId === r.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin ml-auto text-zinc-500" />
                                                ) : (
                                                    <div className="flex justify-end gap-1">
                                                        {r.status !== 'fraud' ? (
                                                            <Button 
                                                                size="icon" 
                                                                variant="ghost" 
                                                                className="h-8 w-8 text-zinc-500 hover:text-red-500 hover:bg-red-950/30"
                                                                onClick={() => handleUpdateStatus(r.id, 'fraud')}
                                                            >
                                                                <VamoIcon name="shield-off" className="h-4 w-4" />
                                                            </Button>
                                                        ) : (
                                                            <Button 
                                                                size="icon" 
                                                                variant="ghost" 
                                                                className="h-8 w-8 text-zinc-500 hover:text-green-500 hover:bg-green-950/30"
                                                                onClick={() => handleUpdateStatus(r.id, 'pending')}
                                                            >
                                                                <VamoIcon name="rotate-ccw" className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {hasMore && (
                        <div className="mt-6 flex justify-center">
                            <Button 
                                variant="outline" 
                                className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 min-w-[200px]"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Cargando...
                                    </>
                                ) : (
                                    'Cargar más referidos'
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function KPICard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string, subtext?: string }) {
    const colorMap: Record<string, string> = {
        blue: "text-blue-500 bg-blue-500/10",
        amber: "text-amber-500 bg-amber-500/10",
        green: "text-green-500 bg-green-500/10",
        indigo: "text-indigo-500 bg-indigo-500/10",
        emerald: "text-emerald-500 bg-emerald-500/10",
    };

    return (
        <Card className="overflow-hidden border-zinc-800 bg-black/40 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{title}</CardTitle>
                <div className={cn("p-1.5 rounded-lg", colorMap[color])}>
                    <VamoIcon name={icon} className="h-3.5 w-3.5" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-xl font-black text-white">{value}</div>
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'rewarded': return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px] hover:bg-green-500/20">🏆 Premiado</Badge>;
        case 'pending': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] hover:bg-amber-500/20">⏳ Pendiente</Badge>;
        case 'fraud': return <Badge variant="destructive" className="bg-red-950/40 text-red-500 border-red-500/20 text-[9px] uppercase font-bold">🚫 Fraude</Badge>;
        default: return <Badge variant="outline" className="text-[9px] border-zinc-800 text-zinc-500">{status}</Badge>;
    }
}
