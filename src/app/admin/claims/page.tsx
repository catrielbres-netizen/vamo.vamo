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
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import Link from 'next/link';
import { FapClaim, FapStatus, UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { updateDoc, doc, getDoc } from 'firebase/firestore';
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
import { safeFixed } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Loader2, ExternalLink, ShieldCheck, AlertCircle, FileText, CheckCircle2, XCircle, CreditCard } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatContainer } from '@/components/Chat/ChatContainer';
import { Ride } from '@/lib/types';

const PAGE_SIZE = 20;

export default function AdminClaimsPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const { cityKey: activeCityKey, loading: loadingContext } = useMunicipalContext();
    
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
    const [resolutionType, setResolutionType] = useState<string>('economic');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Chat Auditor State
    const [isChatAuditorOpen, setIsChatAuditorOpen] = useState(false);
    const [selectedRideForChat, setSelectedRideForChat] = useState<Ride | null>(null);
    const [loadingChatRide, setLoadingChatRide] = useState(false);

    // Live Audit Data
    const [passengerProfile, setPassengerProfile] = useState<UserProfile | null>(null);
    const [driverProfile, setDriverProfile] = useState<UserProfile | null>(null);
    const [fullRideData, setFullRideData] = useState<Ride | null>(null);
    const [loadingAuditData, setLoadingAuditData] = useState(false);

    useEffect(() => {
        if (!firestore || profile?.role !== 'admin' || loadingContext) return;
        fetchClaims();
    }, [firestore, profile, filterStatus, activeCityKey, loadingContext]);

    // Handle Marking as Viewed & Loading Audit Data
    useEffect(() => {
        if (!selectedClaim || !firestore || !profile) return;

        const loadAuditData = async () => {
            setLoadingAuditData(true);
            try {
                // 1. Mark as viewed if not already
                if (!selectedClaim.adminViewedAt) {
                    const claimRef = doc(firestore, 'fap_claims', selectedClaim.id);
                    await updateDoc(claimRef, {
                        adminViewedAt: Timestamp.now(),
                        adminViewedBy: profile.uid,
                        adminViewedByName: profile.name || 'Admin'
                    });
                }

                // 2. Fetch Passenger & Driver Profiles
                const [pSnap, dSnap, rSnap] = await Promise.all([
                    getDoc(doc(firestore, 'users', selectedClaim.passengerId)),
                    getDoc(doc(firestore, 'users', selectedClaim.driverId)),
                    getDoc(doc(firestore, 'rides', selectedClaim.rideId))
                ]);

                if (pSnap.exists()) setPassengerProfile({ uid: pSnap.id, ...pSnap.data() } as UserProfile);
                if (dSnap.exists()) setDriverProfile({ uid: dSnap.id, ...dSnap.data() } as UserProfile);
                if (rSnap.exists()) setFullRideData({ id: rSnap.id, ...rSnap.data() } as Ride);

            } catch (error) {
                console.error("Error loading audit data:", error);
            } finally {
                setLoadingAuditData(false);
            }
        };

        loadAuditData();
    }, [selectedClaim, firestore, profile]);

    const fetchClaims = async () => {
        setLoading(true);
        try {
            const constraints: any[] = [
                orderBy('createdAt', 'desc'),
                limit(PAGE_SIZE)
            ];

            if (filterStatus !== 'all') {
                constraints.push(where('status', '==', filterStatus));
            }

            if (activeCityKey) {
                constraints.push(where('cityKey', '==', activeCityKey));
            }

            let q = query(
                collection(firestore!, 'fap_claims'),
                ...constraints
            );

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
                // Now called 'resolveAssistanceCaseV1' with 'credit' or 'economic'
                const resolveCase = httpsCallable(functions, 'resolveAssistanceCaseV1');
                await resolveCase({ 
                    claimId: selectedClaim.id,
                    resolutionType: resolutionType,
                    amount: Number(actionAmount) || selectedClaim.approvedAmount,
                    note: actionNotes
                });
            } else if (actionType === 'reject') {
                const resolveCase = httpsCallable(functions, 'resolveAssistanceCaseV1');
                await resolveCase({
                    claimId: selectedClaim.id,
                    resolutionType: 'rejection',
                    reason: actionNotes
                });
            } else {
                const reviewCase = httpsCallable(functions, 'reviewAssistanceCaseV1');
                await reviewCase({
                    claimId: selectedClaim.id,
                    action: actionType,
                    adminNotes: actionNotes
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

    const openActionModal = (type: 'review' | 'approve' | 'reject' | 'pay' | 'escalate') => {
        setActionType(type as any);
        if (type === 'approve' || type === 'pay') {
            setActionAmount(String(selectedClaim?.approvedAmount || selectedClaim?.requestedAmount || ''));
            setResolutionType(type === 'pay' ? 'credit' : 'economic');
        }
        setActionNotes('');
        setIsActionModalOpen(true);
    };

    function statusBadge(status: FapStatus) {
        switch (status) {
            case 'draft': return <Badge className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20 uppercase text-[10px]">Borrador</Badge>;
            case 'pending_info': return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 uppercase text-[10px]">Falta Info</Badge>;
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
                        <SelectItem value="pending_info">📧 Falta Info</SelectItem>
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
                                <th className="px-6 py-4">Nivel</th>
                                <th className="px-6 py-4">Ciudad</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Incidente</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {claims.map((claim) => (
                                <tr key={claim.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4 font-mono font-bold text-emerald-500">{claim.caseId}</td>
                                    <td className="px-6 py-4">
                                        <Badge className={cn(
                                            "text-[9px] uppercase font-black",
                                            claim.level === 3 ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                            claim.level === 2 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                                            "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                        )}>
                                            N{claim.level}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 uppercase text-[10px] font-bold text-zinc-500 tracking-tight">{claim.cityKey || 'Global'}</td>
                                    <td className="px-6 py-4 text-zinc-400 text-[11px]">
                                        {claim.createdAt && new Date((claim.createdAt as any).seconds * 1000).toLocaleDateString('es-AR')}
                                    </td>
                                    <td className="px-6 py-4 font-medium uppercase text-[11px] tracking-wider text-zinc-200">{claim.type}</td>
                                    <td className="px-6 py-4">{statusBadge(claim.status)}</td>
                                    <td className="px-6 py-4 font-bold text-right">{formatMoney(claim.requestedAmount)}</td>
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
                                        {!selectedClaim.adminViewedAt && <Badge className="bg-red-500 text-white border-0 text-[8px] animate-pulse">NUEVO</Badge>}
                                    </div>
                                    <p className="text-zinc-500 text-xs mt-1">ID interno: {selectedClaim.id}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-zinc-400 text-xs uppercase font-black tracking-widest">Viaje Original</p>
                                    <div className="flex flex-col items-end gap-1 mt-1">
                                        <Link href={`/admin/live-rides?rideId=${selectedClaim.rideId}`} className="text-emerald-500 text-[10px] font-black uppercase hover:underline flex items-center gap-1">
                                            Auditar Ride <ExternalLink className="h-3 w-3" />
                                        </Link>
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            className="h-7 text-[10px] bg-zinc-800 hover:bg-white/10 text-white font-black uppercase tracking-tighter"
                                            onClick={() => openChatAuditor(selectedClaim.rideId)}
                                        >
                                            <VamoIcon name="message-square" className="h-3 w-3 mr-1.5" /> Chat
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            
                                <Tabs defaultValue="details" className="w-full">
                                    <TabsList className="bg-zinc-900 border-zinc-800 w-full justify-start rounded-none px-6 border-b">
                                        <TabsTrigger value="details">Detalle</TabsTrigger>
                                        <TabsTrigger value="ride">Viaje</TabsTrigger>
                                        <TabsTrigger value="timeline">Línea de Tiempo</TabsTrigger>
                                        <TabsTrigger value="fraud" className="text-red-400">Guardian Antifraude</TabsTrigger>
                                    </TabsList>
                                    
                                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                                        <TabsContent value="details" className="mt-0 space-y-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-zinc-500 uppercase font-black">Pasajero</Label>
                                                    <div className="text-sm font-bold text-zinc-200">{passengerProfile?.name || selectedClaim.passengerNameSnapshot}</div>
                                                    <div className="text-[10px] font-mono text-zinc-500">{selectedClaim.passengerId}</div>
                                                    {passengerProfile?.phone && (
                                                        <a href={`https://wa.me/${passengerProfile.phone.replace(/\D/g, '')}`} target="_blank" className="text-emerald-500 text-[10px] font-bold flex items-center gap-1 hover:underline">
                                                            <VamoIcon name="phone" className="h-3 w-3" /> {passengerProfile.phone}
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="space-y-1 text-right">
                                                    <Label className="text-[10px] text-zinc-500 uppercase font-black">Conductor ({selectedClaim.driverSubtypeSnapshot})</Label>
                                                    <div className="text-sm font-bold text-zinc-200">{driverProfile?.name || selectedClaim.driverNameSnapshot}</div>
                                                    <div className="text-[10px] font-mono text-zinc-500">{selectedClaim.driverId}</div>
                                                    {driverProfile?.phone && (
                                                        <a href={`https://wa.me/${driverProfile.phone.replace(/\D/g, '')}`} target="_blank" className="text-emerald-500 text-[10px] font-bold flex items-center gap-1 hover:underline justify-end">
                                                            <VamoIcon name="phone" className="h-3 w-3" /> {driverProfile.phone}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            {/* RISK & COMPLIANCE BAR */}
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                                                    <Label className="text-[9px] text-zinc-500 uppercase font-black block mb-1">Nivel de Riesgo</Label>
                                                    <div className="flex items-center gap-2">
                                                        <Badge className={cn(
                                                            "text-xs font-black",
                                                            selectedClaim.level === 3 ? "bg-red-500" :
                                                            selectedClaim.level === 2 ? "bg-amber-500" :
                                                            "bg-zinc-500"
                                                        )}>
                                                            NIVEL {selectedClaim.level}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl col-span-2">
                                                    <Label className="text-[9px] text-zinc-500 uppercase font-black block mb-1">Cumplimiento (Compliance)</Label>
                                                    {selectedClaim.compliance?.requirementsMet ? (
                                                        <div className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                                                            <CheckCircle2 className="h-3 w-3" /> Todos los requisitos cumplidos
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-red-400 font-bold flex flex-wrap gap-1">
                                                            <XCircle className="h-3 w-3" /> Faltan: {selectedClaim.compliance?.missingRequirements.join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
                                                <Label className="text-[10px] text-emerald-500 uppercase font-black">Descripción del Incidente ({selectedClaim.type})</Label>
                                                <p className="text-sm text-zinc-300 leading-relaxed italic">"{selectedClaim.description}"</p>
                                            </div>

                                            {/* DEVICE INFO */}
                                            {selectedClaim.deviceInfo && (
                                                <div className="bg-black/20 border border-dashed border-zinc-800 p-3 rounded-xl flex justify-between items-center">
                                                    <div className="flex gap-4">
                                                        <div>
                                                            <Label className="text-[8px] text-zinc-600 uppercase font-black block">IP</Label>
                                                            <span className="text-[10px] font-mono text-zinc-400">{selectedClaim.deviceInfo.ip || '---'}</span>
                                                        </div>
                                                        <div>
                                                            <Label className="text-[8px] text-zinc-600 uppercase font-black block">Plataforma</Label>
                                                            <span className="text-[10px] font-mono text-zinc-400">{selectedClaim.deviceInfo.platform || '---'}</span>
                                                        </div>
                                                    </div>
                                                    <ShieldCheck className="h-4 w-4 text-zinc-800" />
                                                </div>
                                            )}

                                            {selectedClaim.evidenceUrls && selectedClaim.evidenceUrls.length > 0 && (
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] text-zinc-500 uppercase font-black">Evidencia ({selectedClaim.evidenceUrls.length})</Label>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {selectedClaim.evidenceUrls.map((url, i) => (
                                                            <a key={i} href={url} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden border border-zinc-800 hover:border-emerald-500/50 transition-colors">
                                                                <img src={url} alt="Evidencia" className="object-cover w-full h-full" />
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {selectedClaim.adminNotes && (
                                                <div className="space-y-2 bg-blue-500/5 p-4 rounded-xl border border-blue-500/20">
                                                    <Label className="text-[10px] text-blue-400 uppercase font-black">Notas Administrativas</Label>
                                                    <p className="text-sm text-zinc-300">{selectedClaim.adminNotes}</p>
                                                </div>
                                            )}
                                        </TabsContent>

                                        <TabsContent value="ride" className="mt-0 space-y-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] text-zinc-500 uppercase font-black">Telemetría del Viaje</Label>
                                                <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 space-y-3 text-xs">
                                                    {/* SUSPICIOUS DISTANCE ALERT */}
                                                    {(() => {
                                                        const estimatedDist = selectedClaim.rideSnapshot.distanceMeters || 0;
                                                        const realDist = fullRideData?.completedRide?.distanceMeters || 0;
                                                        const realDuration = fullRideData?.completedRide?.durationSeconds || 0;
                                                        const isSuspicious = (realDist < 100 && estimatedDist > 500) || realDuration < 10;
                                                        
                                                        if (!isSuspicious) return null;
                                                        return (
                                                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 mb-2">
                                                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                                                <div>
                                                                    <p className="text-red-500 font-bold uppercase text-[9px]">Telemetría Sospechosa</p>
                                                                    <p className="text-zinc-400 text-[10px] italic">Viaje con distancia real ({realDist}m) o duración ({realDuration}s) extremadamente baja.</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    <div className="flex justify-between border-b border-zinc-800/50 pb-2">
                                                        <span className="text-zinc-500">Origen</span>
                                                        <span className="text-zinc-300 font-medium text-right max-w-[200px]">{selectedClaim.rideSnapshot.origin}</span>
                                                    </div>
                                                    <div className="flex justify-between border-b border-zinc-800/50 pb-2">
                                                        <span className="text-zinc-500">Destino</span>
                                                        <span className="text-zinc-300 font-medium text-right max-w-[200px]">{selectedClaim.rideSnapshot.destination}</span>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                                        <div className="space-y-1">
                                                            <span className="text-zinc-500 block uppercase text-[8px] font-black">Distancia Estimada</span>
                                                            <span className="text-zinc-200">{safeFixed((selectedClaim.rideSnapshot.distanceMeters || 0) / 1000, 2)} km</span>
                                                        </div>
                                                        <div className="space-y-1 text-right">
                                                            <span className="text-zinc-500 block uppercase text-[8px] font-black">Distancia Real</span>
                                                            <span className={cn("font-bold", (fullRideData?.completedRide?.distanceMeters || 0) < 100 ? "text-red-400" : "text-emerald-400")}>
                                                                {safeFixed((fullRideData?.completedRide?.distanceMeters || 0) / 1000, 2)} km
                                                            </span>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <span className="text-zinc-500 block uppercase text-[8px] font-black">Duración Estimada</span>
                                                            <span className="text-zinc-200">{Math.floor((selectedClaim.rideSnapshot.durationSeconds || 0) / 60)} min</span>
                                                        </div>
                                                        <div className="space-y-1 text-right">
                                                            <span className="text-zinc-500 block uppercase text-[8px] font-black">Duración Real</span>
                                                            <span className={cn("font-bold", (fullRideData?.completedRide?.durationSeconds || 0) < 60 ? "text-red-400" : "text-emerald-400")}>
                                                                {Math.floor((fullRideData?.completedRide?.durationSeconds || 0) / 60)} min
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between border-t border-zinc-800/50 pt-2">
                                                        <span className="text-zinc-500">Tarifa Final</span>
                                                        <span className="text-zinc-200 font-bold">{formatMoney(fullRideData?.completedRide?.totalFare || selectedClaim.rideSnapshot.totalFare)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="timeline" className="mt-0">
                                            <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-800 pl-8 pt-2">
                                                {selectedClaim.timeline?.map((event, idx) => (
                                                    <div key={idx} className="relative">
                                                        <div className="absolute -left-[28px] top-1 h-3 w-3 rounded-full bg-zinc-800 border-2 border-black z-10" />
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">{event.action}</span>
                                                                <span className="text-[9px] text-zinc-500">{event.timestamp?.toDate ? event.timestamp.toDate().toLocaleString() : 'Recién'}</span>
                                                            </div>
                                                            <p className="text-xs text-zinc-300">{event.note}</p>
                                                            <p className="text-[9px] text-zinc-500 italic">Por: {event.actorName} ({event.actorRole})</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="fraud" className="mt-0 space-y-4">
                                            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                                                <div>
                                                    <p className="text-[10px] text-red-400 uppercase font-black">Score de Sospecha</p>
                                                    <p className="text-2xl font-black text-red-500">{selectedClaim.validationScore || 0}%</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-zinc-500 uppercase font-black">Estado Guardian</p>
                                                    <Badge className={cn("mt-1", (selectedClaim.validationScore || 0) > 50 ? "bg-red-500" : "bg-emerald-500")}>
                                                        {(selectedClaim.validationScore || 0) > 50 ? 'ALTO RIESGO' : 'NORMAL'}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-[10px] text-zinc-500 uppercase font-black">Banderas Detectadas</Label>
                                                {selectedClaim.fraudFlags && selectedClaim.fraudFlags.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {selectedClaim.fraudFlags.map((flag, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-xs text-red-400 bg-red-400/5 p-2 rounded border border-red-400/10">
                                                                <AlertCircle className="h-3 w-3" />
                                                                {flag}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-zinc-500 italic">No se detectaron anomalías automáticas.</p>
                                                )}
                                            </div>
                                        </TabsContent>
                                    </div>
                                </Tabs>

                            <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 flex justify-between">
                                <div className="flex gap-2">
                                    {['pending', 'reviewing', 'escalated', 'pending_info'].includes(selectedClaim.status) && (
                                        <>
                                            <Button variant="outline" size="sm" onClick={() => openActionModal('review')} className="border-blue-500/30 text-blue-500">
                                                <Loader2 className="h-4 w-4 mr-2" /> Revisar
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => openActionModal('escalate')} className="border-amber-500/30 text-amber-500">
                                                <AlertCircle className="h-4 w-4 mr-2" /> Escalar
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => openActionModal('pay')} className="border-emerald-500/30 text-emerald-500" disabled={!selectedClaim.compliance?.requirementsMet}>
                                                <CheckCircle2 className="h-4 w-4 mr-2" /> Resolver
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => openActionModal('reject')} className="border-red-500/30 text-red-500">
                                                <XCircle className="h-4 w-4 mr-2" /> Rechazar
                                            </Button>
                                        </>
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
                        {(actionType === 'pay' || actionType === 'approve') && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Método de Compensación</Label>
                                    <Select value={resolutionType} onValueChange={setResolutionType}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="credit">VamO Pay (Crédito Inmediato)</SelectItem>
                                            <SelectItem value="economic">Transferencia Bancaria (Manual)</SelectItem>
                                            <SelectItem value="operational">Asistencia Operativa (Sin Pago)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {resolutionType !== 'operational' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Monto de Compensación (Max. $150.000)</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                                            <Input 
                                                id="amount" 
                                                type="number" 
                                                placeholder="0"
                                                className="bg-zinc-900 border-zinc-800 pl-8"
                                                value={actionAmount}
                                                onChange={(e) => setActionAmount(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {actionType !== 'pay' && actionType !== 'approve' && (
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

                        {(actionType === 'pay' || actionType === 'approve') && (
                             <div className="space-y-2">
                                <Label htmlFor="notes">Nota de Resolución</Label>
                                <Textarea 
                                    id="notes" 
                                    className="bg-zinc-900 border-zinc-800 min-h-[80px]"
                                    placeholder="Explica brevemente la resolución..."
                                    value={actionNotes}
                                    onChange={(e) => setActionNotes(e.target.value)}
                                />
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
