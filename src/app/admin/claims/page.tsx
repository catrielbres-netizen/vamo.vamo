'use client';

import React, { useState, useEffect } from 'react';
import { 
    collection, 
    query, 
    orderBy, 
    limit, 
    getDocs, 
    where,
    Timestamp 
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import Link from 'next/link';
import { FapClaim, FapStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Loader2, ExternalLink, ShieldCheck, AlertCircle, FileText, CheckCircle2, XCircle, CreditCard } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ChatContainer } from '@/components/Chat/ChatContainer';
import { Ride } from '@/lib/types';
import { doc, getDoc } from 'firebase/firestore';

const PAGE_SIZE = 20;

export default function AdminClaimsPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    
    // Data State
    const [claims, setClaims] = useState<FapClaim[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // Detail View State
    const [selectedClaim, setSelectedClaim] = useState<FapClaim | null>(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [actionType, setActionType] = useState<'review' | 'approve' | 'reject' | 'pay' | null>(null);
    
    // Form State
    const [actionAmount, setActionAmount] = useState<string>('');
    const [actionNotes, setActionNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Chat Auditor State
    const [isChatAuditorOpen, setIsChatAuditorOpen] = useState(false);
    const [selectedRideForChat, setSelectedRideForChat] = useState<Ride | null>(null);
    const [loadingChatRide, setLoadingChatRide] = useState(false);

    useEffect(() => {
        if (!firestore || profile?.role !== 'admin') return;
        fetchClaims();
    }, [firestore, profile, filterStatus]);

    const fetchClaims = async () => {
        setLoading(true);
        try {
            let q = query(
                collection(firestore!, 'fap_claims'),
                orderBy('createdAt', 'desc'),
                limit(PAGE_SIZE)
            );

            if (filterStatus !== 'all') {
                q = query(q, where('status', '==', filterStatus));
            }

            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FapClaim));
            setClaims(list);
        } catch (error) {
            console.error("Error fetching claims:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async () => {
        if (!selectedClaim || !actionType) return;
        
        setIsSubmitting(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            
            if (actionType === 'pay') {
                const processPayment = httpsCallable(functions, 'processFapPaymentV1');
                await processPayment({ claimId: selectedClaim.id });
            } else {
                const reviewClaim = httpsCallable(functions, 'reviewFapClaimV1');
                await reviewClaim({
                    claimId: selectedClaim.id,
                    action: actionType,
                    approvedAmount: actionType === 'approve' ? Number(actionAmount) : undefined,
                    adminNotes: actionNotes,
                    rejectionReason: actionType === 'reject' ? actionNotes : undefined,
                });
            }

            // Success: Close and Refresh
            setIsActionModalOpen(false);
            setSelectedClaim(null);
            fetchClaims();
        } catch (error: any) {
            alert(error.message || "Error al procesar la acción.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const openChatAuditor = async (rideId: string) => {
        if (!firestore) return;
        setLoadingChatRide(true);
        setIsChatAuditorOpen(true);
        try {
            const rideRef = doc(firestore, 'rides', rideId);
            const rideSnap = await getDoc(rideRef);
            if (rideSnap.exists()) {
                setSelectedRideForChat({ id: rideSnap.id, ...rideSnap.data() } as Ride);
            } else {
                alert("No se encontró el viaje asociado.");
            }
        } catch (error) {
            console.error("Error fetching ride for chat:", error);
        } finally {
            setLoadingChatRide(false);
        }
    };

    const openActionModal = (type: 'review' | 'approve' | 'reject' | 'pay') => {
        setActionType(type);
        if (type === 'approve') setActionAmount(String(selectedClaim?.requestedAmount || ''));
        setActionNotes('');
        setIsActionModalOpen(true);
    };

    function statusBadge(status: FapStatus) {
        switch (status) {
            case 'pending': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 uppercase text-[10px]">Pendiente</Badge>;
            case 'reviewing': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 uppercase text-[10px]">En Revisión</Badge>;
            case 'approved': return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 uppercase text-[10px]">Aprobado</Badge>;
            case 'rejected': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 uppercase text-[10px]">Rechazado</Badge>;
            case 'paid': return <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 uppercase text-[10px]">Pagado</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    }

    function formatMoney(value?: number) {
        if (typeof value !== 'number') return '-';
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(value);
    }

    if (loading && claims.length === 0) {
        return <div className="p-8"><Loader2 className="h-8 w-8 animate-spin mx-auto text-zinc-500" /></div>;
    }

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black flex items-center gap-2">
                        <ShieldCheck className="text-emerald-500 h-8 w-8" />
                        Reclamos F.A.P.
                    </h1>
                    <p className="text-muted-foreground text-sm">Auditoría del Fondo de Asistencia al Pasajero (v1.0)</p>
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800">
                        <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all">Todos los casos</SelectItem>
                        <SelectItem value="pending">⏳ Pendientes</SelectItem>
                        <SelectItem value="reviewing">🔍 En Revisión</SelectItem>
                        <SelectItem value="approved">✅ Aprobados</SelectItem>
                        <SelectItem value="rejected">❌ Rechazados</SelectItem>
                        <SelectItem value="paid">💰 Pagados</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            <tr>
                                <th className="px-6 py-4">Caso ID</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Incidente</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4">Monto Sol.</th>
                                <th className="px-6 py-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {claims.map((claim) => (
                                <tr key={claim.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4 font-mono font-bold text-emerald-500">{claim.caseId}</td>
                                    <td className="px-6 py-4 text-zinc-400">
                                        {claim.createdAt && new Date((claim.createdAt as any).seconds * 1000).toLocaleDateString('es-AR')}
                                    </td>
                                    <td className="px-6 py-4 font-medium uppercase text-[11px] tracking-wider text-zinc-200">{claim.type}</td>
                                    <td className="px-6 py-4">{statusBadge(claim.status)}</td>
                                    <td className="px-6 py-4 font-bold">{formatMoney(claim.requestedAmount)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-8 hover:bg-zinc-800"
                                            onClick={() => setSelectedClaim(claim)}
                                        >
                                            Ver Detalle <VamoIcon name="chevron-right" className="ml-2 h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {claims.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-zinc-500 italic">No hay reclamos con estos filtros.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* DETAIL MODAL */}
            <Dialog open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)}>
                <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 p-0 overflow-hidden">
                    {selectedClaim && (
                        <>
                            <div className="bg-zinc-900/50 p-6 border-b border-zinc-800 flex justify-between items-center">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-black text-emerald-500 font-mono tracking-tighter">{selectedClaim.caseId}</h2>
                                        {statusBadge(selectedClaim.status)}
                                    </div>
                                    <p className="text-zinc-500 text-xs mt-1">ID interno: {selectedClaim.id}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-zinc-400 text-xs uppercase font-black tracking-widest">Viaje Original</p>
                                    <Link href={`/admin/ride-detail?id=${selectedClaim.rideId}`} className="text-emerald-500 text-xs hover:underline flex items-center justify-end gap-1">
                                        Ver Ride <ExternalLink className="h-3 w-3" />
                                    </Link>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        className="mt-2 h-7 text-[10px] bg-zinc-800 hover:bg-white/10 text-white font-black uppercase tracking-tighter"
                                        onClick={() => openChatAuditor(selectedClaim.rideId)}
                                    >
                                        <VamoIcon name="message-square" className="h-3 w-3 mr-1.5" /> Auditar Chat
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500 uppercase font-black">Pasajero ID</Label>
                                        <div className="text-sm font-medium text-zinc-200">{selectedClaim.passengerId}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-zinc-500 uppercase font-black">Conductor ID</Label>
                                        <div className="text-sm font-medium text-zinc-200">{selectedClaim.driverId}</div>
                                    </div>
                                </div>

                                <div className="space-y-2 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
                                    <Label className="text-[10px] text-emerald-500 uppercase font-black">Descripción del Incidente</Label>
                                    <p className="text-sm text-zinc-300 leading-relaxed italic">"{selectedClaim.description}"</p>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] text-zinc-500 uppercase font-black">Detalles del Viaje (Snapshot)</Label>
                                    <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 grid grid-cols-2 gap-4 text-xs">
                                        <div><span className="text-zinc-500">Origen:</span> {selectedClaim.rideSnapshot.origin}</div>
                                        <div><span className="text-zinc-500">Destino:</span> {selectedClaim.rideSnapshot.destination}</div>
                                        <div><span className="text-zinc-500">Tarifa:</span> {formatMoney(selectedClaim.rideSnapshot.totalFare)}</div>
                                        <div><span className="text-zinc-500">Servicio:</span> {selectedClaim.rideSnapshot.driverSubtype.toUpperCase()}</div>
                                    </div>
                                </div>

                                {selectedClaim.adminNotes && (
                                    <div className="space-y-2 bg-blue-500/5 p-4 rounded-xl border border-blue-500/20">
                                        <Label className="text-[10px] text-blue-400 uppercase font-black">Notas de Auditoría</Label>
                                        <p className="text-sm text-zinc-300">{selectedClaim.adminNotes}</p>
                                    </div>
                                )}

                                {selectedClaim.rejectionReason && (
                                    <div className="space-y-2 bg-red-500/5 p-4 rounded-xl border border-red-500/20">
                                        <Label className="text-[10px] text-red-400 uppercase font-black">Motivo de Rechazo</Label>
                                        <p className="text-sm text-red-400/80">{selectedClaim.rejectionReason}</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 flex justify-between">
                                <div className="flex gap-2">
                                    {['pending', 'reviewing'].includes(selectedClaim.status) && (
                                        <>
                                            <Button variant="outline" size="sm" onClick={() => openActionModal('review')} className="border-blue-500/30 text-blue-500">
                                                <Loader2 className="h-4 w-4 mr-2" /> En Revisión
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => openActionModal('approve')} className="border-emerald-500/30 text-emerald-500">
                                                <CheckCircle2 className="h-4 w-4 mr-2" /> Aprobar
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => openActionModal('reject')} className="border-red-500/30 text-red-500">
                                                <XCircle className="h-4 w-4 mr-2" /> Rechazar
                                            </Button>
                                        </>
                                    )}
                                    {selectedClaim.status === 'approved' && (
                                        <Button onClick={() => openActionModal('pay')} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0 shadow-lg shadow-emerald-500/20">
                                            <CreditCard className="h-4 w-4 mr-2" /> Procesar Pago
                                        </Button>
                                    )}
                                </div>
                                <Button variant="ghost" onClick={() => setSelectedClaim(null)}>Cerrar</Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* ACTION MODAL (APPROVE/REJECT/PAY) */}
            <Dialog open={isActionModalOpen} onOpenChange={setIsActionModalOpen}>
                <DialogContent className="sm:max-w-[400px] bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest text-xs font-black">
                            {actionType === 'approve' ? 'Aprobar Reclamo' : actionType === 'reject' ? 'Rechazar Reclamo' : actionType === 'pay' ? 'Procesar Pago' : 'Cambiar a Revisión'}
                        </DialogTitle>
                        <DialogDescription>
                            {actionType === 'pay' ? 'Esta acción generará un débito en el balance de VamO y marcará el caso como pagado.' : 'Ingresa los detalles para continuar con la auditoría del caso.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {actionType === 'approve' && (
                            <div className="space-y-2">
                                <Label htmlFor="amount">Monto de Compensación (Max. $150.000)</Label>
                                <Input 
                                    id="amount" 
                                    type="number" 
                                    placeholder="0"
                                    className="bg-zinc-900 border-zinc-800"
                                    value={actionAmount}
                                    onChange={(e) => setActionAmount(e.target.value)}
                                />
                            </div>
                        )}

                        {actionType !== 'pay' && (
                            <div className="space-y-2">
                                <Label htmlFor="notes">{actionType === 'reject' ? 'Motivo de Rechazo' : 'Notas Administrativas'}</Label>
                                <Textarea 
                                    id="notes" 
                                    className="bg-zinc-900 border-zinc-800 min-h-[100px]"
                                    placeholder="Ingresa los detalles aquí..."
                                    value={actionNotes}
                                    onChange={(e) => setActionNotes(e.target.value)}
                                />
                            </div>
                        )}

                        {actionType === 'pay' && selectedClaim && (
                            <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl text-center">
                                <p className="text-zinc-400 text-xs uppercase font-black">Monto a Transferir</p>
                                <p className="text-2xl font-black text-emerald-500">{formatMoney(selectedClaim.approvedAmount)}</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsActionModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                        <Button 
                            className={cn(
                                "border-0 shadow-lg",
                                actionType === 'reject' ? "bg-red-600 hover:bg-red-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white"
                            )}
                            onClick={handleAction}
                            disabled={isSubmitting}
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar Acción
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CHAT AUDITOR DIALOG */}
            <Dialog open={isChatAuditorOpen} onOpenChange={setIsChatAuditorOpen}>
                <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 p-0 overflow-hidden">
                    {loadingChatRide ? (
                        <div className="p-20 flex flex-col items-center justify-center gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cargando Historia...</span>
                        </div>
                    ) : selectedRideForChat ? (
                        <ChatContainer 
                            ride={selectedRideForChat}
                            role="admin"
                            onClose={() => setIsChatAuditorOpen(false)}
                        />
                    ) : (
                        <div className="p-10 text-center text-zinc-500 uppercase font-black text-xs">Error al cargar chat</div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
