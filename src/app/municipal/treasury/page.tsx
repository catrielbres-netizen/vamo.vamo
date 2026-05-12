'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useFirebase } from '@/firebase/provider';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    doc, 
    addDoc, 
    serverTimestamp, 
    limit 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MunicipalAccount, MunicipalWithdrawRequest } from '@/lib/types';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

export default function TreasuryPage() {
    const { profile } = useUser();
    const { firestore, functions } = useFirebase();
    const { cityKey: currentCityKey, isTreasury } = useMunicipalContext();
    const { toast } = useToast();
    
    const [account, setAccount] = useState<MunicipalAccount | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [requests, setRequests] = useState<MunicipalWithdrawRequest[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawReason, setWithdrawReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const cityKey = currentCityKey || profile?.cityKey;

    useEffect(() => {
        if (!firestore) return;
        
        if (!cityKey) {
            console.warn("⚠️ [TESORERIA] cityKey no disponible. Abortando carga.");
            const timer = setTimeout(() => {
                if (loading) setLoading(false);
            }, 2000);
            return () => clearTimeout(timer);
        }

        const handleError = (error: any) => {
            console.error("❌ [TESORERIA] Error de Firestore:", error);
            toast({
                variant: 'destructive',
                title: 'Error de acceso',
                description: 'No tienes permisos para ver los datos financieros o falta un índice.'
            });
            setLoading(false);
        };

        // 1. Listen to Municipal Account
        const unsubAccount = onSnapshot(doc(firestore, 'municipal_accounts', cityKey), (snap) => {
            if (snap.exists()) setAccount(snap.data() as MunicipalAccount);
            setLoading(false);
        }, handleError);

        // 2. Listen to Transactions (Ledger)
        const qTransactions = query(
            collection(firestore, 'platform_transactions'),
            where('cityKey', '==', cityKey),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubTransactions = onSnapshot(qTransactions, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, handleError);

        // 3. Listen to Withdraw Requests
        const qRequests = query(
            collection(firestore, 'municipal_withdraw_requests'),
            where('cityKey', '==', cityKey),
            orderBy('createdAt', 'desc')
        );
        const unsubRequests = onSnapshot(qRequests, (snap) => {
            setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as MunicipalWithdrawRequest)));
        }, handleError);

        return () => {
            unsubAccount();
            unsubTransactions();
            unsubRequests();
        };
    }, [firestore, cityKey]);

    const handleRequestWithdrawal = async () => {
        if (!amountNum || amountNum <= 0) return;
        if (!withdrawReason.trim()) {
            toast({ variant: 'destructive', title: 'Falta razón', description: 'Por favor explicá el motivo del retiro.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const requestWithdrawal = httpsCallable(functions!, 'requestMunicipalWithdrawalV1');
            await requestWithdrawal({
                amount: amountNum,
                reason: withdrawReason,
                cityKey
            });
            
            toast({ title: 'Solicitud enviada', description: 'Tu solicitud de retiro está en proceso de revisión.' });
            setIsWithdrawModalOpen(false);
            setWithdrawAmount('');
            setWithdrawReason('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApprove = async (requestId: string) => {
        try {
            const approveWithdrawal = httpsCallable(functions!, 'approveMunicipalWithdrawalV1');
            await approveWithdrawal({ requestId });
            toast({ title: 'Solicitud aprobada', description: 'Has aprobado la solicitud de retiro.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const handleReject = async (requestId: string) => {
        const reason = prompt("Razón del rechazo/cancelación:");
        if (!reason) return;

        try {
            const rejectWithdrawal = httpsCallable(functions!, 'rejectMunicipalWithdrawalV1');
            await rejectWithdrawal({ requestId, reason });
            toast({ title: 'Solicitud rechazada/cancelada', description: 'Se ha liberado el saldo pendiente.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const handleExecute = async (requestId: string) => {
        try {
            const executeWithdrawal = httpsCallable(functions!, 'executeMunicipalWithdrawalV1');
            await executeWithdrawal({ requestId, note: 'Ejecución desde panel municipal' });
            toast({ title: 'Retiro ejecutado', description: 'El retiro se ha procesado correctamente.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const syncTreasury = httpsCallable(functions!, 'syncMunicipalAccountsV1');
            const result = await syncTreasury() as any;
            toast({ 
                title: 'Sincronización completa', 
                description: `Se han actualizado ${result.data.syncCount} cuentas municipales con datos históricos.` 
            });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error de sincronización', description: error.message });
        } finally {
            setIsSyncing(false);
        }
    };

    const amountNum = parseFloat(withdrawAmount);

    if (loading) {
        return <div className="flex h-[60vh] items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tighter">TESORERÍA MUNICIPAL</h1>
                    <p className="text-zinc-500 text-sm italic">Gestión de participación municipal y fondos acumulados.</p>
                </div>
                <div className="flex gap-2">
                    {profile?.role === 'admin' && (
                        <Button 
                            onClick={handleSync}
                            disabled={isSyncing}
                            variant="outline"
                            className="border-white/10 bg-white/5 text-zinc-400 hover:text-white font-bold rounded-xl"
                        >
                            <VamoIcon name="refresh" className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                            {isSyncing ? 'Sincronizando...' : 'Sincronizar Saldo'}
                        </Button>
                    )}
                    {isTreasury && (
                        <Button 
                            onClick={() => setIsWithdrawModalOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
                        >
                            <VamoIcon name="plus" className="w-4 h-4 mr-2" />
                            Solicitar Retiro
                        </Button>
                    )}
                </div>
            </div>

            {/* STATS CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/40 border-white/5 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Saldo Disponible</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-white tracking-tighter">${account?.currentBalance?.toLocaleString() || '0'}</p>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/40 border-white/5 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Total Acumulado</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-emerald-400 tracking-tighter">${account?.totalAccumulated?.toLocaleString() || '0'}</p>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/40 border-white/5 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Total Retirado</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-indigo-400 tracking-tighter">${account?.totalWithdrawn?.toLocaleString() || '0'}</p>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/40 border-white/5 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">En Proceso</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-amber-400 tracking-tighter">${account?.pendingWithdrawalAmount?.toLocaleString() || '0'}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* LEDGER / TRANSACTIONS */}
                <div className="xl:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <VamoIcon name="list" className="w-5 h-5 text-zinc-500" />
                        <h2 className="text-lg font-black text-white tracking-tight uppercase">Historial de Movimientos</h2>
                    </div>
                    <div className="bg-zinc-900/40 border border-white/5 rounded-[2rem] overflow-hidden">
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-[10px] font-black uppercase text-zinc-500">Fecha</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-zinc-500">Tipo</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-zinc-500">Detalle</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-zinc-500">Monto</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-32 text-center text-zinc-600 italic">No hay movimientos registrados.</TableCell>
                                    </TableRow>
                                ) : transactions.map((tx) => (
                                    <TableRow key={tx.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <TableCell className="text-[11px] text-zinc-400">
                                            {tx.createdAt?.toDate().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </TableCell>
                                        <TableCell>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                                                tx.type === 'municipal_contribution' ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                                            )}>
                                                {tx.type === 'municipal_contribution' ? `Ingreso ${tx.cityKey === 'rawson' ? '5%' : '2%'}` : 'Retiro'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs text-zinc-300 max-w-[200px] truncate">
                                            {tx.note || 'Movimiento de tesorería'}
                                        </TableCell>
                                        <TableCell className={cn(
                                            "text-right font-black",
                                            tx.amount > 0 ? "text-emerald-400" : "text-amber-400"
                                        )}>
                                            {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* WITHDRAWAL REQUESTS */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <VamoIcon name="clock" className="w-5 h-5 text-zinc-500" />
                        <h2 className="text-lg font-black text-white tracking-tight uppercase">Solicitudes de Retiro</h2>
                    </div>
                    <div className="space-y-3">
                        {requests.length === 0 ? (
                            <div className="p-8 text-center bg-zinc-900/40 border border-white/5 rounded-[2rem] text-zinc-600 italic">
                                No hay solicitudes pendientes.
                            </div>
                        ) : requests.map((req) => (
                            <Card key={req.id} className="bg-zinc-900/60 border-white/5 overflow-hidden">
                                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Solicitado por</span>
                                        <span className="text-xs font-bold text-white">{req.requestedByName}</span>
                                    </div>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                                        req.status === 'pending' ? "bg-amber-500/10 text-amber-400" : 
                                        req.status === 'approved' ? "bg-indigo-500/10 text-indigo-400" : 
                                        req.status === 'executed' ? "bg-emerald-500/10 text-emerald-400" : 
                                        "bg-red-500/10 text-red-400"
                                    )}>
                                        {req.status}
                                    </span>
                                </CardHeader>
                                <CardContent className="p-4 pt-2 space-y-3">
                                    <div className="flex justify-between items-end">
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-zinc-600 italic line-clamp-2">"{req.reason}"</p>
                                            <p className="text-[10px] text-zinc-500">
                                                {req.createdAt?.toDate().toLocaleDateString()}
                                            </p>
                                        </div>
                                        <p className="text-xl font-black text-white tracking-tighter">${req.requestedAmount.toLocaleString()}</p>
                                    </div>

                                    {/* ACTIONS */}
                                    <div className="flex gap-2 pt-2">
                                        {isTreasury && (req.status === 'pending' || req.status === 'approved') && (
                                            <Button 
                                                onClick={() => handleReject(req.id!)}
                                                variant="outline"
                                                className="flex-1 h-8 border-white/5 bg-white/5 text-zinc-400 hover:text-white text-[10px] font-black uppercase rounded-lg"
                                            >
                                                {profile?.uid === req.requestedBy ? 'Cancelar' : 'Rechazar'}
                                            </Button>
                                        )}
                                        {isTreasury && req.status === 'pending' && profile?.uid !== req.requestedBy && (
                                            <Button 
                                                onClick={() => handleApprove(req.id!)}
                                                className="flex-1 h-8 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase rounded-lg"
                                            >
                                                Aprobar
                                            </Button>
                                        )}
                                        {req.status === 'approved' && profile?.role === 'admin' && (
                                            <Button 
                                                onClick={() => handleExecute(req.id!)}
                                                className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase rounded-lg"
                                            >
                                                Ejecutar Pago
                                            </Button>
                                        )}
                                    </div>

                                    {req.approvals && req.approvals.length > 0 && (
                                        <div className="pt-2 border-t border-white/5">
                                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Aprobaciones</p>
                                            <div className="flex flex-wrap gap-1">
                                                {req.approvals.map((a, idx) => (
                                                    <div key={idx} className="bg-white/5 px-2 py-0.5 rounded text-[8px] text-zinc-400">
                                                        {a.userName}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>

            {/* WITHDRAWAL MODAL */}
            <Dialog open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}>
                <DialogContent className="bg-zinc-900 border-white/10 sm:rounded-[2rem] max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black text-white tracking-tighter">SOLICITAR RETIRO</DialogTitle>
                        <DialogDescription className="text-zinc-500">
                            Esta solicitud deberá ser aprobada por otro administrador municipal.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount" className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Monto a retirar</Label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                                <Input 
                                    id="amount"
                                    type="number"
                                    placeholder="0.00"
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    className="h-14 pl-8 rounded-2xl bg-white/[0.03] border-white/5 text-xl font-black text-white focus:bg-white/[0.07] transition-all"
                                />
                            </div>
                            <p className="text-[10px] text-zinc-600 italic ml-1">
                                Saldo disponible: ${account?.currentBalance?.toLocaleString()}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reason" className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Motivo del retiro</Label>
                            <Input 
                                id="reason"
                                placeholder="Ej: Pago de canon municipal Mes X"
                                value={withdrawReason}
                                onChange={(e) => setWithdrawReason(e.target.value)}
                                className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-sm text-white focus:bg-white/[0.07] transition-all"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button 
                            onClick={handleRequestWithdrawal}
                            disabled={isSubmitting || !amountNum || amountNum > (account?.currentBalance || 0)}
                            className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
                        >
                            {isSubmitting ? 'Procesando...' : 'Confirmar Solicitud'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
