'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, startAfter, DocumentSnapshot } from 'firebase/firestore';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { WithdrawalRequest, PlatformTransaction } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrency } from '@/lib/utils';
import { Loader2, Landmark, BadgeDollarSign, Receipt, History } from 'lucide-react';

const PAGE_SIZE = 20;

export default function AdminWithdrawalsPage() {
  const firestore = useFirestore();
  const { profile: adminProfile } = useUser();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // States for Pending
  const [pendingRequests, setPendingRequests] = useState<WithdrawalRequest[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);

  // States for History
  const [historyRequests, setHistoryRequests] = useState<WithdrawalRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [lastHistoryDoc, setLastHistoryDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  // Stats
  const [totalCommissions, setTotalCommissions] = useState(0);
  const [totalPendingAmount, setTotalPendingAmount] = useState(0);
  const [totalGMV, setTotalGMV] = useState(0);

  // Platform Ledger
  const [ledgerTransactions, setLedgerTransactions] = useState<PlatformTransaction[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  useEffect(() => {
    if (!firestore || adminProfile?.role !== 'admin') return;
    fetchPending();
    fetchStats();
    fetchLedger();
  }, [firestore, adminProfile]);

  const fetchStats = async () => {
    if (!firestore) return;
    try {
        const ridesQ = query(collection(firestore, 'rides'), where('status', '==', 'completed'), limit(100));
        const ridesSnap = await getDocs(ridesQ);
        
        let gmv = 0;
        let vamoCut = 0;
        ridesSnap.forEach(doc => {
            const r = doc.data();
            const total = r.pricing?.final?.total || r.pricing?.estimated?.total || 0;
            const driverGets = r.pricing?.driverReceivesTotal || (total * 0.85);
            gmv += total;
            vamoCut += (total - driverGets);
        });
        setTotalGMV(gmv);
        setTotalCommissions(vamoCut);

        const pendingQ = query(collection(firestore, 'withdrawal_requests'), where('status', '==', 'pending'));
        const pendingSnap = await getDocs(pendingQ);
        let pendingTotal = 0;
        pendingSnap.forEach(doc => {
            pendingTotal += (doc.data().amount || 0);
        });
        setTotalPendingAmount(pendingTotal);
    } catch (e) {
        console.error("Error fetching admin stats:", e);
    }
  };

  const fetchLedger = async () => {
    if (!firestore) return;
    setLoadingLedger(true);
    try {
        const q = query(collection(firestore, 'platform_transactions'), orderBy('createdAt', 'desc'), limit(50));
        const snap = await getDocs(q);
        setLedgerTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlatformTransaction)));
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingLedger(false);
    }
  };

  const fetchPending = async () => {
    if (!firestore) return;
    setLoadingPending(true);
    try {
        const q = query(
            collection(firestore, 'withdrawal_requests'),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest)));
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingPending(false);
    }
  };

  const fetchHistory = async (afterDoc: DocumentSnapshot | null = null) => {
    if (!firestore) return;
    if (!afterDoc) {
        setLoadingHistory(true);
        setHistoryRequests([]);
    }
    try {
        const q = query(
            collection(firestore, 'withdrawal_requests'),
            where('status', 'in', ['approved', 'rejected']),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE),
            ...(afterDoc ? [startAfter(afterDoc)] : [])
        );
        const snap = await getDocs(q);
        const newList = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest));
        
        setLastHistoryDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMoreHistory(snap.docs.length === PAGE_SIZE);
        
        if (afterDoc) {
            setHistoryRequests(prev => [...prev, ...newList]);
        } else {
            setHistoryRequests(newList);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingHistory(false);
    }
  };

  const handleProcessRequest = async (requestId: string, action: 'approve' | 'reject') => {
    if (!firebaseApp) return;
    setProcessingId(requestId);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const processWithdrawal = httpsCallable(functions, 'processWithdrawalByAdminV1');
      await processWithdrawal({ requestId, action });
      toast({ title: 'Solicitud Procesada', description: `La solicitud ha sido marcada como ${action === 'approve' ? 'aprobada' : 'rechazada'}.` });
      
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      if (historyRequests.length > 0) fetchHistory();
      
    } catch(e: any) {
      toast({ variant: 'destructive', title: 'Error al procesar', description: e.message });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* HEADER & TOP STATS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">Financial <span className="text-primary not-italic">Hub</span></h1>
          <p className="text-zinc-500 text-sm font-medium">Gestión de ingresos, retiros y auditoría transaccional de VamO PRO.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchPending(); fetchStats(); fetchLedger(); }} className="rounded-full border-zinc-800 text-zinc-400">
                <VamoIcon name="refresh" className="mr-2 h-3 w-3" /> Actualizar Datos
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-zinc-900/40 border-zinc-800 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <BadgeDollarSign className="w-16 h-16 text-primary" />
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ingresos VamO (Comisiones)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-black tracking-tighter text-white">{formatCurrency(totalCommissions)}</div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">Bruto acumulado (últ. 100 viajes)</p>
            </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Landmark className="w-16 h-16 text-amber-500" />
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Pendiente de Pago</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-black tracking-tighter text-amber-500">{formatCurrency(totalPendingAmount)}</div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">Total solicitado por conductores</p>
            </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Receipt className="w-16 h-16 text-zinc-500" />
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Volumen Operativo (GMV)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-black tracking-tighter text-zinc-300">{formatCurrency(totalGMV)}</div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">Total transaccionado en la plataforma</p>
            </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
            <TabsList className="bg-transparent h-auto p-0 gap-8">
                <TabsTrigger value="pending" className="bg-transparent border-none p-0 text-zinc-500 data-[state=active]:text-primary data-[state=active]:bg-transparent relative h-10 font-bold uppercase text-xs tracking-widest">
                    Solicitudes
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full scale-x-0 transition-transform data-[state=active]:scale-x-100" />
                </TabsTrigger>
                <TabsTrigger value="history" onClick={() => fetchHistory()} className="bg-transparent border-none p-0 text-zinc-500 data-[state=active]:text-primary data-[state=active]:bg-transparent relative h-10 font-bold uppercase text-xs tracking-widest">
                    Historial de Pagos
                </TabsTrigger>
                <TabsTrigger value="ledger" className="bg-transparent border-none p-0 text-zinc-500 data-[state=active]:text-primary data-[state=active]:bg-transparent relative h-10 font-bold uppercase text-xs tracking-widest">
                    Libro Mayor
                </TabsTrigger>
            </TabsList>
        </div>

        <TabsContent value="pending" className="mt-6">
            {loadingPending ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-3xl bg-zinc-900" />)}
                </div>
            ) : pendingRequests.length === 0 ? (
                <div className="p-20 text-center border-2 border-dashed border-zinc-800 rounded-[40px] bg-zinc-900/20">
                    <VamoIcon name="shield-check" className="h-16 w-16 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500 font-black uppercase tracking-widest">Todo al día</p>
                    <p className="text-zinc-600 text-sm">No hay solicitudes de retiro pendientes.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pendingRequests.map(req => (
                        <Card key={req.id} className="bg-black/40 border-zinc-800 rounded-[32px] overflow-hidden flex flex-col group hover:border-primary/50 transition-colors">
                            <CardHeader className="bg-zinc-900/50 p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <Badge variant="outline" className="rounded-full bg-amber-500/10 text-amber-500 border-amber-500/20 px-3 py-1 font-black text-[10px] uppercase tracking-widest">Pendiente</Badge>
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase">{(req.createdAt as any)?.toDate?.().toLocaleDateString('es-AR') || 'Sin fecha'}</span>
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-white tracking-tighter uppercase">{req.driverName}</h3>
                                    <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">ID Conductor: <span className="text-zinc-300 font-mono">{req.driverId.slice(-8)}</span></p>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 flex-1 space-y-6">
                                <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
                                    <p className="text-[10px] text-primary/60 font-black uppercase tracking-widest mb-1">Monto a Liquidar</p>
                                    <div className="text-4xl font-black tracking-tighter text-white">{formatCurrency(req.amount)}</div>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                                            <VamoIcon name="map" className="h-4 w-4 text-zinc-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">CBU / ALIAS</p>
                                            <p className="text-sm font-bold text-white break-all">{req.bankInfo?.cbuOrAlias}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                                            <VamoIcon name="user" className="h-4 w-4 text-zinc-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Titular</p>
                                            <p className="text-sm font-bold text-white">{req.bankInfo?.accountHolder}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-6 pt-0 flex gap-3">
                                <Button 
                                    className="flex-1 bg-white text-black font-black uppercase tracking-widest text-[10px] h-12 rounded-2xl hover:bg-zinc-200"
                                    onClick={() => handleProcessRequest(req.id!, 'approve')}
                                    disabled={!!processingId}
                                >
                                    {processingId === req.id ? <Loader2 className="animate-spin h-4 w-4" /> : 'Aprobar Pago'}
                                </Button>
                                <Button 
                                    variant="outline" 
                                    className="flex-1 border-red-500/20 text-red-500 font-black uppercase tracking-widest text-[10px] h-12 rounded-2xl hover:bg-red-500/10 hover:border-red-500/50"
                                    onClick={() => handleProcessRequest(req.id!, 'reject')}
                                    disabled={!!processingId}
                                >
                                    Rechazar
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
            <Card className="bg-black/40 border-zinc-800 rounded-[32px] overflow-hidden">
                <CardContent className="p-0">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-900/50 border-b border-zinc-800">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Fecha</th>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Conductor</th>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Monto</th>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Estado</th>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Procesado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {loadingHistory && <div className="p-10 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-primary" /></div>}
                            {historyRequests.map(req => (
                                <tr key={req.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4 text-xs font-medium text-zinc-400">
                                        {(req.createdAt as any)?.toDate?.().toLocaleString('es-AR') || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-white uppercase group-hover:text-primary transition-colors">{req.driverName}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase italic">{req.driverId.slice(-8)}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-black text-white">
                                        {formatCurrency(req.amount)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge variant="outline" className={cn(
                                            "rounded-full px-3 py-1 font-black text-[9px] uppercase tracking-widest",
                                            req.status === 'approved' ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                                        )}>
                                            {req.status === 'approved' ? 'Pagado' : 'Rechazado'}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 text-[10px] text-zinc-500 font-medium">
                                        {req.processedAt ? (req.processedAt as any).toDate().toLocaleDateString('es-AR') : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {hasMoreHistory && (
                        <div className="p-4 flex justify-center border-t border-zinc-800">
                            <Button variant="ghost" size="sm" onClick={() => fetchHistory(lastHistoryDoc)} className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">Cargar más</Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
            <Card className="bg-black/40 border-zinc-800 rounded-[32px] overflow-hidden">
                <CardContent className="p-0">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-900/50 border-b border-zinc-800">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Referencia / Tipo</th>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Conductor</th>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Monto</th>
                                <th className="px-6 py-4 text-[10px] font-black tracking-widest text-zinc-500 uppercase">Motivo / Nota</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {loadingLedger && <div className="p-10 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-primary" /></div>}
                            {ledgerTransactions.length === 0 && !loadingLedger && <div className="p-20 text-center text-zinc-500 uppercase font-black tracking-widest">Sin transacciones registradas</div>}
                            {ledgerTransactions.map(tx => (
                                <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={cn("p-2 rounded-lg", 
                                                tx.amount > 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                            )}>
                                                <History className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{tx.type}</p>
                                                <p className="text-[9px] text-zinc-600 font-mono">{(tx.createdAt as any)?.toDate?.().toLocaleString('es-AR')}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-xs font-bold text-white uppercase">{tx.driverId.slice(-8)}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={cn("text-sm font-black", tx.amount > 0 ? "text-green-500" : "text-red-500")}>
                                            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 max-w-xs">
                                        <p className="text-xs text-zinc-500 font-medium italic truncate">{tx.reason || tx.note || '-'}</p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WithdrawalCard({ req, onProcess, processing, formatCurrency, formatTimestamp }: any) {
    return (
        <Card className={cn("border-zinc-800 bg-black/40 backdrop-blur-xl relative overflow-hidden flex flex-col", processing && "opacity-50")}>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Solicitud Retiro</span>
                    <span className="text-lg font-black text-primary">{formatCurrency(req.amount)}</span>
                </div>
                <CardTitle className="text-white">{req.driverName}</CardTitle>
                <CardDescription className="text-[10px]">ID: {req.id.substring(0, 8)}...</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 space-y-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-zinc-500">Titular</span>
                        <span className="font-bold text-white">{req.bankInfo?.accountHolder || 'N/A'}</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-1">
                        <span className="text-zinc-500">CBU / ALIAS</span>
                        <div className="bg-black/40 p-2 rounded border border-zinc-800 font-mono text-primary flex justify-between items-center group">
                            <span className="break-all">{req.bankInfo?.cbuOrAlias || 'N/A'}</span>
                        </div>
                    </div>
                    <div className="pt-2 text-[10px] text-zinc-600 italic">
                        Solicitado el {formatTimestamp(req.createdAt)}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="grid grid-cols-2 gap-3 pt-6">
                <Button 
                    variant="outline" 
                    className="rounded-2xl border-white/5 bg-white/5 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all font-bold text-zinc-400"
                    onClick={() => onProcess(req.id, 'reject')}
                    disabled={processing}
                >
                    Rechazar
                </Button>
                <Button 
                    variant="morphic"
                    className="rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black shadow-green-500/20"
                    onClick={() => onProcess(req.id, 'approve')}
                    disabled={processing}
                >
                    {processing ? <Loader2 className="animate-spin h-4 w-4" /> : 'Aprobar Pago'}
                </Button>
            </CardFooter>
        </Card>
    );
}
