'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot, addDoc, collection, setDoc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn } from '@/lib/utils';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { featureFlags } from '@/config/features';
import { LazyQRCode } from '@/components/LazyQRCode';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    MunicipalProfile,
    MunicipalExpressStatus,
    MunicipalChecklistKey,
    DocItemStatus,
    TrafficObservation,
} from '@/lib/types';

// ─── Helpers de UI ────────────────────────────────────────────────────────────

interface StatusConfig {
    label: string;
    description: string;
    color: string;        // Tailwind text color
    bg: string;           // Tailwind bg color
    border: string;
    icon: string;
    canOperate: boolean;
}

const STATUS_CONFIG: Record<MunicipalExpressStatus, StatusConfig> = {
    pending_municipal_review: {
        label: 'Pendiente de revisión municipal',
        description: 'La municipalidad está revisando la documentación que subiste. Podés presentarte físicamente con tu código si es requerido por tu localidad.',
        color:  'text-amber-400',
        bg:     'bg-amber-500/10',
        border: 'border-amber-500/30',
        icon:   'clock',
        canOperate: false,
    },
    municipal_observed: {
        label: 'Observado — requiere corrección',
        description: 'La municipalidad dejó observaciones sobre tu documentación. Revisá el detalle y corregí lo indicado.',
        color:  'text-orange-400',
        bg:     'bg-orange-500/10',
        border: 'border-orange-500/30',
        icon:   'alert-triangle',
        canOperate: false,
    },
    municipal_approved: {
        label: 'Aprobado — trámite en proceso',
        description: 'Tu documentación fue aprobada. La municipalidad está completando tu habilitación. Aguardá la activación final.',
        color:  'text-blue-400',
        bg:     'bg-blue-500/10',
        border: 'border-blue-500/30',
        icon:   'loader',
        canOperate: false,
    },
    active: {
        label: '¡Habilitado por la municipalidad!',
        description: 'Tu habilitación municipal está vigente. Podés operar normalmente.',
        color:  'text-emerald-400',
        bg:     'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        icon:   'check-circle',
        canOperate: true,
    },
    renewal_under_review: {
        label: 'Renovación en revisión',
        description: 'Subiste documentación nueva. La municipalidad la está revisando. Mientras tanto, no podés operar.',
        color:  'text-blue-400',
        bg:     'bg-blue-500/10',
        border: 'border-blue-500/30',
        icon:   'refresh-cw',
        canOperate: false,
    },
    suspended_expired_license: {
        label: 'Suspendido — Licencia vencida',
        description: 'Licencia vencida: no podés operar hasta que la municipalidad apruebe la renovación.',
        color:  'text-red-400',
        bg:     'bg-red-500/10',
        border: 'border-red-500/30',
        icon:   'shield-off',
        canOperate: false,
    },
    suspended_expired_insurance: {
        label: 'Suspendido — Seguro vencido',
        description: 'Seguro vencido: no podés operar hasta que la municipalidad apruebe la renovación.',
        color:  'text-red-400',
        bg:     'bg-red-500/10',
        border: 'border-red-500/30',
        icon:   'shield-off',
        canOperate: false,
    },
    suspended_expired_itv: {
        label: 'Suspendido — ITV/VTV vencido',
        description: 'La inspección técnica de tu vehículo ha vencido. No podés operar hasta que la municipalidad apruebe la renovación.',
        color:  'text-red-400',
        bg:     'bg-red-500/10',
        border: 'border-red-500/30',
        icon:   'shield-off',
        canOperate: false,
    },
    suspended_unpaid_canon: {
        label: 'Suspendido — Canon municipal impago',
        description: 'Regularizá el canon municipal en tu municipalidad para volver a operar.',
        color:  'text-red-400',
        bg:     'bg-red-500/10',
        border: 'border-red-500/30',
        icon:   'ban',
        canOperate: false,
    },
    suspended_by_municipality: {
        label: 'Suspendido por la municipalidad',
        description: 'La municipalidad suspendió tu habilitación. Contactalos directamente para regularizar tu situación.',
        color:  'text-red-400',
        bg:     'bg-red-500/10',
        border: 'border-red-500/30',
        icon:   'ban',
        canOperate: false,
    },
    rejected_by_municipality: {
        label: 'Solicitud rechazada',
        description: 'La municipalidad rechazó tu solicitud de habilitación. Contactalos para conocer los motivos y opciones.',
        color:  'text-zinc-400',
        bg:     'bg-zinc-500/10',
        border: 'border-zinc-500/30',
        icon:   'x-circle',
        canOperate: false,
    },
    suspended_by_traffic: {
        label: 'Suspendido preventivamente por Tránsito',
        description: 'Tránsito ha emitido una suspensión operativa. Verificá qué documento o trámite es requerido en la plataforma.',
        color:  'text-red-400',
        bg:     'bg-red-500/10',
        border: 'border-red-500/30',
        icon:   'shield-off',
        canOperate: false,
    },
    suspended_by_admin: {
        label: 'Cuenta Bloqueada por Administración',
        description: 'Tu cuenta ha sido inhabilitada desde Administración. Contactá a soporte técnico.',
        color:  'text-red-400',
        bg:     'bg-red-500/10',
        border: 'border-red-500/30',
        icon:   'shield-off',
        canOperate: false,
    },
};

const CHECKLIST_LABELS: Record<MunicipalChecklistKey, string> = {
    dniFront:               'DNI — Frente',
    dniBack:                'DNI — Dorso',
    driverLicense:          'Licencia de conducir',
    vehicleInsurance:       'Seguro del vehículo',
    passengerCoverageInsurance: 'Cobertura pasajeros — Seguros Rivadavia',
    vehicleRegistrationCard:'Cédula del vehículo',
    criminalRecord:         'Antecedentes penales vigentes',
    municipalCanon:         'Canon municipal (arancel)',
    disinfectionReceipt:    'Certificado de Desinfección',
};

const DOC_STATUS_BADGE: Record<DocItemStatus, { label: string; color: string; bg: string }> = {
    pending:   { label: 'Pendiente',  color: 'text-zinc-400',   bg: 'bg-zinc-500/10' },
    submitted: { label: 'Presentado', color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    approved:  { label: 'Aprobado',   color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
    observed:  { label: 'Observado',  color: 'text-orange-400', bg: 'bg-orange-500/10' },
};

function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysUntil(ts: any): number | null {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ ts, label }: { ts: any; label: string }) {
    const days = daysUntil(ts);
    if (days === null) return (
        <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
            <span className="text-sm text-zinc-500">{label}</span>
            <span className="text-xs font-bold text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded-full">Sin cargar</span>
        </div>
    );
    const isExpired  = days < 0;
    const isCritical = days >= 0 && days <= 14;
    return (
        <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
            <span className="text-sm text-zinc-300">{label}</span>
            <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                isExpired  ? 'text-red-400 bg-red-500/10'
                           : isCritical ? 'text-amber-400 bg-amber-500/10'
                                        : 'text-emerald-400 bg-emerald-500/10'
            )}>
                {isExpired
                    ? `Vencido (hace ${Math.abs(days)}d)`
                    : days === 0 ? 'Vence hoy'
                                : `Vence ${formatDate(ts)}`}
            </span>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const isExpired = (ts: any) => {
    if (!ts) return false;
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    return date < new Date();
};

export default function DriverMuniStatusPage() {
    const { user, profile } = useUser();
    const router = useRouter();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [munProfile, setMunProfile] = useState<MunicipalProfile | null>(null);
    const [observations, setObservations] = useState<TrafficObservation[]>([]);
    const [loading, setLoading]       = useState(true);

    const [uploadingDoc, setUploadingDoc] = useState<MunicipalChecklistKey | null>(null);
    const [fileSelected, setFileSelected] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (featureFlags.vamoParticularModeEnabled || !featureFlags.municipalModeEnabled) {
            router.replace('/driver/profile');
            return;
        }

        if (!firestore || !user?.uid) return;
        const ref = doc(firestore, 'municipal_profiles', user.uid);
        const unsub = onSnapshot(ref, snap => {
            setMunProfile(snap.exists() ? (snap.data() as MunicipalProfile) : null);
            setLoading(false);
        }, () => setLoading(false));

        // [VamO PRO] Public profile is synced automatically via Cloud Functions
        // when users or municipal_profiles documents are updated.

        const obsQuery = query(
            collection(firestore, "traffic_observations"),
            where("driverId", "==", user.uid)
        );
        const unsubObs = onSnapshot(obsQuery, (snap) => {
            const obsList: TrafficObservation[] = [];
            snap.forEach((doc) => obsList.push({ observationId: doc.id, ...doc.data() } as TrafficObservation));
            // Sort client-side to avoid index requirement for now
            obsList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setObservations(obsList);
        }, (err) => {
            console.error("Error fetching traffic observations:", err);
        });

        return () => {
            unsub();
            unsubObs();
        };
    }, [firestore, user?.uid]);

    // All drivers use this page to manage their municipal status
    if (featureFlags.vamoParticularModeEnabled || !featureFlags.municipalModeEnabled) {
        return (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4 space-y-4">
                <VamoIcon name="lock" className="h-10 w-10 text-zinc-500" />
                <h2 className="text-xl font-black text-white">Módulo No Disponible</h2>
                <p className="text-sm text-zinc-400">Este módulo está reservado para la versión municipal de VamO.</p>
                <Button className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl" onClick={() => router.replace('/driver/profile')}>
                    Volver a mi perfil
                </Button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="py-16 flex justify-center">
                <div className="w-8 h-8 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
            </div>
        );
    }

    // Estado desde el perfil base (denormalizado, siempre disponible)
    const munStatus = (profile?.municipalStatus ?? 'pending_municipal_review') as MunicipalExpressStatus;
    let cfg       = STATUS_CONFIG[munStatus] ?? STATUS_CONFIG['pending_municipal_review'];

    // [VamO PRO] Grace Period Check for Observations
    const graceUntil = profile?.observationGraceUntil;
    const isInsideGrace = graceUntil && (graceUntil.toDate ? graceUntil.toDate() : new Date(graceUntil)) > new Date();
    
    if ((munStatus === 'municipal_observed' || munStatus === 'renewal_under_review') && isInsideGrace) {
        const timeStr = graceUntil.toDate ? graceUntil.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(graceUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        cfg = {
            ...cfg,
            canOperate: true,
            label: munStatus === 'renewal_under_review' ? 'Revisión (En Plazo de Gracia)' : 'Observaciones (En Plazo de Gracia)',
            description: munStatus === 'renewal_under_review' 
                ? `Subiste tu corrección. Podés seguir operando mientras la revisan hasta las ${timeStr}.`
                : `Tenés observaciones pendientes. Podés seguir operando hasta las ${timeStr}. Corregilas antes de ese horario para evitar la inhabilitación.`,
            color:  'text-amber-400',
            bg:     'bg-amber-500/10',
            border: 'border-amber-500/30',
        };
    }

    const checklist = munProfile?.checklist;
    const CHECKLIST_KEYS = Object.keys(CHECKLIST_LABELS) as MunicipalChecklistKey[];

    const allApproved = checklist ? CHECKLIST_KEYS.every(k => checklist[k]?.status === 'approved') : false;

    const handleUpload = async () => {
        if (!uploadingDoc || !fileSelected || !user?.uid || !munProfile) return;
        setIsUploading(true);
        try {
            const storage = getStorage(firestore.app);
            const ext = fileSelected.name.split('.').pop() || 'tmp';
            const path = `municipal_docs/${munProfile.cityKey}/${user.uid}/${uploadingDoc}_${Date.now()}.${ext}`;
            const docRef = storageRef(storage, path);
            
            await uploadBytes(docRef, fileSelected);
            const url = await getDownloadURL(docRef);

            // Registrar en Firestore municipal_doc_submissions
            await addDoc(collection(firestore, 'municipal_doc_submissions'), {
                driverId: user.uid,
                municipalCode: munProfile.municipalCode,
                cityKey: munProfile.cityKey,
                docType: uploadingDoc,
                storageUrl: url,
                storagePath: path,
                status: 'pending_review',
                uploadedAt: serverTimestamp()
            });

            // Actualizar el estado municipal y el checklist (usando setDoc con merge de objetos para máxima compatibilidad)
            const updatePayload: any = {
                municipalStatus: 'renewal_under_review',
                updatedAt: serverTimestamp(),
                checklist: {
                    [uploadingDoc]: {
                        status: 'submitted',
                        submittedAt: serverTimestamp(),
                        storageUrl: url
                    }
                }
            };

            // Si el documento que sube es el que pidió tránsito, marcamos el pedido como cumplido
            if (munProfile?.lastTrafficRequest?.documentType === uploadingDoc) {
                updatePayload.lastTrafficRequest = {
                    ...munProfile.lastTrafficRequest,
                    status: 'submitted',
                    submittedAt: serverTimestamp()
                };
            }

            await setDoc(doc(firestore, 'municipal_profiles', user.uid), updatePayload, { merge: true });

            // Dual update a users table (Locked to Backend)
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const functions = getFunctions(undefined, 'us-central1');
            const updateProfile = httpsCallable(functions, 'updateProfileV1');
            
            await updateProfile({
                municipalStatus: 'renewal_under_review'
            });

            await addDoc(collection(firestore, 'municipal_audit_log'), {
                driverId: user.uid,
                municipalCode: munProfile.municipalCode,
                cityKey: munProfile.cityKey,
                actionBy: user.uid,
                actionByRole: 'driver',
                action: 'renewal_document_submitted',
                checklistKey: uploadingDoc,
                createdAt: serverTimestamp()
            });

            setUploadingDoc(null);
            setFileSelected(null);
            toast({ title: 'Documento enviado a revisión con éxito' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error subiendo archivo', description: err.message });
        } finally {
            setIsUploading(false);
        }
    };

    const isTraffic = profile?.trafficSuspended || (profile?.isSuspended && profile?.suspensionSource === 'traffic');
    const isMunicipal = profile?.municipalSuspended || (profile?.isSuspended && profile?.suspensionSource === 'municipal');
    const isAdmin = profile?.adminSuspended || (profile?.isSuspended && profile?.suspensionSource === 'admin');
    const activeSuspension = isTraffic || isMunicipal || isAdmin;

    return (
        <div className="space-y-5 pb-10">

            {/* ── HEADER ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-1">
                <VamoIcon name="landmark" className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-black text-white tracking-tight">Habilitación Municipal</h2>
            </div>

            {/* TRAFFIC OBSERVATIONS BLOCK */}
            {observations.filter(o => ['open', 'awaiting_driver_response', 'pending_traffic_review', 'rejected'].includes(o.status)).map(obs => (
                <div key={obs.observationId} className={`rounded-3xl border-2 p-6 space-y-4 shadow-2xl animate-in fade-in slide-in-from-top-2 ${obs.severity === 'critical' ? 'border-red-500/50 bg-red-500/10 shadow-red-500/10' : 'border-amber-500/50 bg-amber-500/10 shadow-amber-500/10'}`}>
                    <div className="flex items-center gap-3">
                        <VamoIcon name="alert-triangle" className={`h-6 w-6 shrink-0 ${obs.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                        <h3 className={`text-base font-black uppercase tracking-tight ${obs.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
                            Observación de Tránsito
                        </h3>
                    </div>
                    <p className="text-sm font-bold text-white">{obs.reason}</p>
                    
                    <div className="flex items-center gap-2">
                        <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-mono text-white">Documento requerido: {obs.requestedDocumentLabel || 'No especificado'}</span>
                        <span className="bg-black/30 px-2 py-1 rounded text-[10px] font-black uppercase text-zinc-300">Estado: {obs.status || 'pending'}</span>
                    </div>

                    {obs.status === 'rejected' && obs.resolutionNote && (
                        <div className="p-3 bg-red-950/60 rounded-xl border border-red-500/20">
                            <p className="text-[10px] font-black text-red-500 uppercase">Motivo de rechazo:</p>
                            <p className="text-xs text-red-300 italic">"{obs.resolutionNote}"</p>
                        </div>
                    )}

                    {obs.status === 'awaiting_driver_response' && obs.dueAt && obs.severity === 'regularizable' && (
                        <div className="text-xs text-amber-300 font-semibold bg-amber-500/20 p-3 rounded-xl flex flex-col gap-1">
                            <span className="font-bold">Tenés 24 horas hábiles para responder.</span>
                            <span>Plazo límite: {obs.dueAt.seconds ? new Date(obs.dueAt.seconds * 1000).toLocaleString() : (typeof obs.dueAt.toDate === 'function' ? obs.dueAt.toDate().toLocaleString() : new Date(obs.dueAt).toLocaleString())}</span>
                            <span className="mt-1 opacity-90 italic">Mientras estés dentro del plazo, podés seguir operando salvo que Tránsito indique una suspensión crítica.</span>
                        </div>
                    )}

                    {obs.status === 'awaiting_driver_response' && obs.severity === 'critical' && (
                        <div className="text-xs text-red-300 font-semibold bg-red-500/20 p-3 rounded-xl flex flex-col gap-1">
                            <span className="font-bold">Tu cuenta fue suspendida preventivamente por Tránsito.</span>
                            <span>Subí la documentación para solicitar revisión.</span>
                        </div>
                    )}

                    {(obs.status === 'open' || obs.status === 'awaiting_driver_response' || obs.status === 'rejected') && (
                        <div className="pt-2">
                            <input
                                type="file"
                                id={`file-${obs.observationId}`}
                                className="hidden"
                                accept="image/*,.pdf"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setIsUploading(true);
                                    try {
                                        const storage = getStorage(firestore.app);
                                        const ext = file.name.split('.').pop() || 'tmp';
                                        const path = `municipal_docs/${munProfile?.cityKey || 'unknown'}/${user?.uid}/${obs.observationId}_${Date.now()}.${ext}`;
                                        const docRef = storageRef(storage, path);
                                        await uploadBytes(docRef, file);
                                        const url = await getDownloadURL(docRef);
                                        
                                        const { getFunctions, httpsCallable } = await import('firebase/functions');
                                        const functions = getFunctions(undefined, 'us-central1');
                                        const submitObs = httpsCallable(functions, 'submitTrafficObservationDocumentV1');
                                        
                                        const payload = {
                                            observationId: obs.observationId,
                                            driverId: user!.uid,
                                            documentType: obs.requestedDocumentType || 'unknown',
                                            storagePath: path,
                                            fileUrl: url,
                                            cityKey: munProfile?.cityKey || ''
                                        };
                                        
                                        // Sanitize undefined values
                                        Object.keys(payload).forEach(key => {
                                            if ((payload as any)[key] === undefined) {
                                                delete (payload as any)[key];
                                            }
                                        });

                                        await submitObs(payload);
                                        toast({ title: 'Documento subido a Tránsito' });
                                    } catch(err: any) {
                                        toast({ variant: 'destructive', title: 'Error', description: err.message });
                                    } finally {
                                        setIsUploading(false);
                                    }
                                }}
                            />
                            <label htmlFor={`file-${obs.observationId}`}>
                                <Button
                                    asChild
                                    className="w-full h-12 bg-white text-black font-black uppercase text-xs rounded-xl cursor-pointer hover:bg-zinc-200"
                                    disabled={isUploading}
                                >
                                    <span>
                                        {isUploading ? 'SUBIENDO...' : 'SUBIR DOCUMENTO'}
                                    </span>
                                </Button>
                            </label>
                        </div>
                    )}
                </div>
            ))}

            {activeSuspension && (
                <div className="rounded-3xl border-2 border-red-500/50 bg-red-500/10 p-6 space-y-3 shadow-2xl shadow-red-500/10 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <VamoIcon name="alert-circle" className="h-6 w-6 text-red-400 shrink-0" />
                        <h3 className="text-base font-black text-red-400 uppercase tracking-tight">
                            {isAdmin ? 'Cuenta Bloqueada por Administración' : 
                             isMunicipal ? 'Habilitación Suspendida por Municipio' : 
                             'Suspensión Preventiva de Tránsito'}
                        </h3>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                        {isAdmin ? 'Tu cuenta ha sido bloqueada por la administración de la plataforma VamO.' :  
                         isMunicipal ? 'Tu habilitación municipal ha sido suspendida por el área central del Municipio.' : 
                         'Tránsito solicitó una corrección documental o emitió una suspensión operativa. Cargá el documento requerido para solicitar rehabilitación.'}
                    </p>
                    {((isAdmin && profile?.adminSuspensionReason) || 
                      (isMunicipal && profile?.municipalSuspensionReason) || 
                      (isTraffic && profile?.trafficSuspensionReason)) && (
                        <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5 mt-2">
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">Motivo informado:</p>
                            <p className="text-xs text-red-400 italic">
                                "{isAdmin ? profile.adminSuspensionReason : 
                                  isMunicipal ? profile.municipalSuspensionReason : 
                                  profile.trafficSuspensionReason}"
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── CÓDIGO MUNICIPAL ────────────────────────────────────────── */}
            {profile?.municipalCode && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Tu código municipal</p>
                        <p className="text-2xl font-black text-white tracking-widest font-mono">
                            {profile.municipalCode}
                        </p>
                        <p className="text-xs text-zinc-600 mt-0.5">Presentalo en la municipalidad de {munProfile?.city ?? profile.city}</p>
                    </div>
                    <Dialog>
                        <DialogTrigger asChild>
                            <button className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center hover:bg-amber-500/20 transition-all active:scale-95 group">
                                <VamoIcon name="qr-code" className="h-7 w-7 text-amber-400 group-hover:scale-110 transition-transform" />
                            </button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-950 border-white/10 text-white rounded-[2rem] max-w-[320px]">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-black italic uppercase tracking-tighter text-center">
                                    Credencial Digital
                                </DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col items-center gap-6 py-6">
                                <div className="relative p-4 bg-white rounded-3xl shadow-2xl overflow-hidden">
                                    <LazyQRCode 
                                        value={`${typeof window !== 'undefined' ? window.location.origin : 'https://vamoapp.online'}/verify/driver/${user?.uid}`}
                                        size={180}
                                        level="H"
                                        marginSize={2}
                                    />
                                    {activeSuspension && (
                                        <div className="absolute inset-0 bg-red-600/80 rounded-3xl flex flex-col items-center justify-center text-white p-4 text-center select-none backdrop-blur-[2px]">
                                            <VamoIcon name="shield-off" className="w-12 h-12 text-white animate-bounce" />
                                            <span className="text-[10px] font-black uppercase tracking-wider mt-2">Operación Bloqueada</span>
                                            <span className="text-[8px] opacity-90 mt-1 font-semibold leading-tight">Esta credencial no está habilitada para operar</span>
                                        </div>
                                    )}
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Código: {profile?.municipalCode}</p>
                                    <p className="text-xs text-zinc-500">Presentá este QR ante la autoridad de tránsito.</p>
                                </div>
                                <div className="w-full space-y-2">
                                    <Button 
                                        className="w-full h-12 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold"
                                        onClick={() => window.open(`/verify/driver/${user?.uid}`, '_blank')}
                                    >
                                        Previsualizar Credencial Pública
                                    </Button>
                                    <Button 
                                        variant="outline"
                                        className="w-full h-10 rounded-xl border-white/5 bg-white/5 text-[10px] uppercase font-black tracking-widest"
                                        onClick={() => {
                                            toast({ title: 'Credencial Sincronizada', description: 'Tus datos públicos se actualizan automáticamente con el servidor.' });
                                        }}
                                    >
                                        Sincronizar Datos QR
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            )}

            {/* ── PEDIDOS DE TRÁNSITO ─────────────────────────────────────── */}
            {munProfile?.lastTrafficRequest && munProfile.lastTrafficRequest.status === 'requested' && (
                <div className="rounded-3xl border-2 border-indigo-500/50 bg-indigo-500/10 p-6 space-y-4 shadow-2xl shadow-indigo-500/10">
                    <div className="flex items-start gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/40 shrink-0">
                            <VamoIcon name="file-warning" className="h-7 w-7 text-white" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-black text-white italic tracking-tight">Documentación Solicitada</h3>
                            <p className="text-sm text-indigo-300 mt-1 font-medium">
                                El área de Tránsito requiere: <span className="text-white font-black underline decoration-indigo-400">{CHECKLIST_LABELS[munProfile.lastTrafficRequest.documentType as MunicipalChecklistKey]}</span>
                            </p>
                            
                            <div className="mt-4 p-4 bg-zinc-950/60 rounded-[1.5rem] border border-white/5">
                                <p className="text-xs text-zinc-300 italic leading-relaxed">"{munProfile.lastTrafficRequest.reason}"</p>
                                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                                    <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Solicitado por {munProfile.lastTrafficRequest.requestedByName}</span>
                                    <span className="text-[9px] text-indigo-400 font-bold">REQUERIDO</span>
                                </div>
                            </div>

                            <Button 
                                className="mt-5 w-full bg-white text-indigo-600 font-black uppercase tracking-widest text-xs h-12 rounded-2xl hover:bg-zinc-100 transition-all active:scale-[0.98] shadow-lg"
                                onClick={() => {
                                    setUploadingDoc(munProfile.lastTrafficRequest!.documentType as MunicipalChecklistKey);
                                    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' });
                                }}
                            >
                                Subir Documentación Ahora
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ESTADO ACTUAL (semáforo visual) ─────────────────────────── */}
            <div className={cn('rounded-2xl border p-5 space-y-3 relative overflow-hidden', cfg.bg, cfg.border)}>
                {munStatus === 'active' && (
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <VamoIcon name="party-popper" className="h-20 w-20 text-emerald-400 rotate-12" />
                    </div>
                )}
                <div className="flex items-start gap-4">
                    <div className={cn('w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center border shadow-sm', cfg.bg, cfg.border)}>
                        <VamoIcon name={cfg.icon as any} className={cn('h-6 w-6', cfg.color, munStatus === 'municipal_approved' ? 'animate-spin' : '')} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={cn('text-lg font-black tracking-tight', cfg.color)}>{cfg.label}</p>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{cfg.description}</p>
                    </div>
                </div>
                {!cfg.canOperate ? (
                    <div className="mt-2 flex items-center gap-2 pt-3 border-t border-white/5">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em]">
                            No podés ponerte online actualmente
                        </span>
                    </div>
                ) : (
                    <div className="mt-2 flex items-center gap-2 pt-3 border-t border-white/5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                            Estás habilitado para recibir viajes
                        </span>
                    </div>
                )}
            </div>

            {/* ── CONDITIONAL CONTENT ─────────────────────────────────────── */}
            {munStatus === 'active' ? (
                <div className="space-y-5">
                    {/* Tarjeta de Éxito / Fiesta */}
                    <div className="rounded-3xl bg-emerald-500/5 border border-emerald-500/20 p-6 text-center space-y-4">
                        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
                            <VamoIcon name="badge-check" className="h-10 w-10 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white">¡Felicitaciones!</h3>
                            <p className="text-sm text-zinc-400 mt-1">Tu habilitación municipal está completa y vigente. Trabajá con tranquilidad y seguí las normas locales.</p>
                        </div>
                        <Link href="/driver">
                            <Button className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-widest text-xs mt-2 rounded-2xl shadow-lg shadow-emerald-500/20">
                                Ir al panel principal
                            </Button>
                        </Link>
                    </div>
                </div>
            ) : (
                <>
                    {/* ── CHECKLIST DOCUMENTAL (solo visible si no está activo) ──── */}
                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Documentación requerida</p>
                            {allApproved && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">✓ Todo aprobado</span>}
                        </div>
                        <div className="divide-y divide-white/5">
                            {CHECKLIST_KEYS.map(key => {
                                const item = checklist?.[key];
                                const status = (item?.status ?? 'pending') as DocItemStatus;
                                const badge = DOC_STATUS_BADGE[status];
                                const obs = item?.observation;
                                return (
                                    <div key={key} className="px-4 py-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", badge.bg)}>
                                                    <VamoIcon 
                                                        name={status === 'approved' ? 'check' : status === 'observed' ? 'alert-circle' : 'file-text'} 
                                                        className={cn("h-4 w-4", badge.color)} 
                                                    />
                                                </div>
                                                <span className="text-xs font-semibold text-zinc-200">{CHECKLIST_LABELS[key]}</span>
                                            </div>
                                            <div className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md", badge.bg, badge.color)}>
                                                {badge.label}
                                            </div>
                                        </div>
                                        {obs && (
                                            <p className="ml-11 mt-1 text-[11px] text-orange-400/80 italic leading-relaxed">
                                                “{obs}”
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* ── VENCIMIENTOS ────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Vencimientos</p>
                </div>
                <div className="px-4 py-2">
                    <ExpiryBadge ts={munProfile?.licenseExpiry}          label="Licencia de conducir" />
                    <ExpiryBadge ts={munProfile?.insuranceExpiry}         label="Seguro del vehículo" />
                    <ExpiryBadge ts={munProfile?.itvExpiry}               label="ITV / VTV del vehículo" />
                    <ExpiryBadge ts={munProfile?.backgroundCheckExpiry}   label="Antecedentes penales" />
                </div>
            </div>

            {/* ── CANON MUNICIPAL ─────────────────────────────────────────── */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Canon municipal</p>
                    <p className={cn(
                        'text-sm font-bold',
                        (munProfile?.canonStatus === 'paid' && !isExpired(munProfile?.canonExpiry)) ? 'text-emerald-400'
                        : (munProfile?.canonStatus === 'overdue' || isExpired(munProfile?.canonExpiry)) ? 'text-red-400'
                                                              : 'text-amber-400'
                    )}>
                        {(munProfile?.canonStatus === 'paid' && !isExpired(munProfile?.canonExpiry)) ? '✓ Pagado y vigente'
                         : (munProfile?.canonStatus === 'overdue' || isExpired(munProfile?.canonExpiry)) ? '✗ Deuda o Vencido — Regularizá en la municipalidad'
                                                                 : '⏳ Pendiente de pago/revisión'}
                    </p>
                    {(munProfile?.canonPaidAt || munProfile?.canonExpiry) && (
                        <div className="mt-2 space-y-0.5">
                            {munProfile?.canonPaidAt && (
                                <p className="text-xs text-zinc-400 font-medium">
                                    Pagado el: <span className="text-zinc-200">{formatDate(munProfile.canonPaidAt)}</span>
                                </p>
                            )}
                            {munProfile?.canonExpiry && (
                                <p className={cn(
                                    "text-xs font-medium",
                                    isExpired(munProfile.canonExpiry) ? "text-red-400" : "text-zinc-400"
                                )}>
                                    Vence el: <span className={cn(
                                        "font-bold",
                                        isExpired(munProfile.canonExpiry) ? "text-red-400 underline" : "text-zinc-200"
                                    )}>{formatDate(munProfile.canonExpiry)}</span>
                                </p>
                            )}
                        </div>
                    )}
                </div>
                <VamoIcon
                    name={munProfile?.canonStatus === 'paid' && !isExpired(munProfile?.canonExpiry) ? 'badge-check' : 'receipt'}
                    className={cn(
                        'h-6 w-6',
                        munProfile?.canonStatus === 'paid' && !isExpired(munProfile?.canonExpiry) ? 'text-emerald-500' : 'text-zinc-600'
                    )}
                />
            </div>

            {/* ── SUBIDA DE RENOVACIONES (solo si no está activo o tiene vencidos) ── */}
            {munStatus !== 'active' && (
                <div id="upload-section" className="rounded-2xl border border-dashed border-white/10 p-5 space-y-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            Renovación de documentos
                        </p>
                        <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                            Si un documento está vencido o fue observado por el municipio, podés subir la versión correcta aquí.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <select
                            value={uploadingDoc || ''}
                            onChange={e => { setUploadingDoc(e.target.value as MunicipalChecklistKey); setFileSelected(null); }}
                            className="w-full h-11 text-xs font-medium bg-zinc-900/50 border border-white/10 rounded-xl px-3 text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                        >
                            <option value="" disabled className="bg-zinc-900 text-zinc-400">Seleccioná qué documento vas a subir...</option>
                            {CHECKLIST_KEYS.filter(k => checklist?.[k]?.status !== 'approved').map(k => (
                                <option key={k} value={k} className="bg-zinc-900 text-white">{CHECKLIST_LABELS[k]}</option>
                            ))}
                            {CHECKLIST_KEYS.filter(k => checklist?.[k]?.status === 'approved').length > 0 && (
                                <optgroup label="Documentos aprobados (Subir para renovar)" className="bg-zinc-900 text-zinc-500 font-bold">
                                    {CHECKLIST_KEYS.filter(k => checklist?.[k]?.status === 'approved').map(k => (
                                        <option key={k} value={k} className="bg-zinc-900 text-white">{CHECKLIST_LABELS[k]}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>

                        {uploadingDoc && (
                             <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5">
                                 <input
                                     type="file"
                                     accept="image/*,.pdf"
                                     onChange={e => setFileSelected(e.target.files?.[0] || null)}
                                     className="text-xs text-zinc-400 font-medium file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 w-full cursor-pointer transition-colors"
                                 />
                             </div>
                        )}
                        
                        {fileSelected && (
                            <Button
                                disabled={isUploading}
                                onClick={handleUpload}
                                className={cn(
                                    'w-full h-12 text-sm font-black uppercase tracking-widest transition-all',
                                    isUploading ? 'bg-zinc-800 text-zinc-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                )}
                            >
                                {isUploading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Subiendo...
                                    </span>
                                ) : 'Subir y enviar a revisión'}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* ── AYUDA ───────────────────────────────────────────────────── */}
            <div className="text-center space-y-1 pt-2">
                <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-widest">
                    La habilitación es exclusivamente municipal
                </p>
                <p className="text-xs text-zinc-700">
                    VamO no interviene en la decisión de habilitación. Para consultas, dirigite a la municipalidad de {munProfile?.city ?? profile?.city ?? 'tu ciudad'}.
                </p>
            </div>
        </div>
    );
}
