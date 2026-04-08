'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { MunicipalDocSubmission, normalizeCityKey, MunicipalChecklistKey } from '@/lib/types';
import Link from 'next/link';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const DOC_LABELS: Record<MunicipalChecklistKey, string> = {
    dniFront:               'DNI — Frente',
    dniBack:                'DNI — Dorso',
    driverLicense:          'Licencia de conducir',
    vehicleInsurance:       'Seguro del vehículo',
    vehicleRegistrationCard:'Cédula del vehículo',
    criminalRecord:         'Antecedentes penales',
    municipalCanon:         'Canon municipal',
};

function formatDate(ts: any) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MunicipalRenewalsPage() {
    const firestore  = useFirestore();
    const { profile, user } = useUser();
    const { toast } = useToast();
    const [subs,    setSubs]    = useState<(MunicipalDocSubmission & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy,    setBusy]    = useState<string | null>(null);

    const cityKey = profile?.city ? normalizeCityKey(profile.city) : null;

    useEffect(() => {
        if (!firestore || !cityKey) return;
        const q = query(
            collection(firestore, 'municipal_doc_submissions'),
            where('cityKey', '==', cityKey),
            where('status', '==', 'pending_review'),
            orderBy('uploadedAt', 'desc')
        );
        getDocs(q).then(snap => {
            setSubs(snap.docs.map(d => ({ ...d.data(), id: d.id } as MunicipalDocSubmission & { id: string })));
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [firestore, cityKey]);

    const handleDecision = async (sub: MunicipalDocSubmission & { id: string }, approve: boolean, obs?: string) => {
        if (!firestore || !user) return;
        setBusy(sub.id);
        try {
            const newStatus = approve ? 'approved' : 'rejected';
            // Update the submission
            await updateDoc(doc(firestore, 'municipal_doc_submissions', sub.id), {
                status: newStatus,
                reviewedAt: serverTimestamp(),
                reviewedBy: user.uid,
                observation: obs ?? null,
            });

            // If approved: update checklist item in municipal_profiles
            if (approve) {
                await updateDoc(doc(firestore, 'municipal_profiles', sub.driverId), {
                    [`checklist.${sub.docType}.status`]: 'approved',
                    [`checklist.${sub.docType}.reviewedAt`]: serverTimestamp(),
                    [`checklist.${sub.docType}.reviewedBy`]: user.uid,
                    [`checklist.${sub.docType}.observation`]: null,
                    ...(sub.documentExpiryDate ? { [`..expiry for ${sub.docType}`]: sub.documentExpiryDate } : {}),
                    updatedAt: serverTimestamp(),
                });
            }

            // Audit log
            await addDoc(collection(firestore, 'municipal_audit_log'), {
                driverId: sub.driverId,
                municipalCode: sub.municipalCode,
                cityKey: sub.cityKey,
                actionBy: user.uid,
                actionByRole: 'admin_municipal',
                action: approve ? 'renewal_approved' : 'renewal_rejected',
                checklistKey: sub.docType,
                note: obs ?? null,
                createdAt: serverTimestamp(),
            });

            toast({ title: approve ? '✓ Renovación aprobada' : 'Renovación rechazada' });
            setSubs(prev => prev.filter(s => s.id !== sub.id));
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(null); }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-black text-white">Renovaciones Pendientes</h1>
                <p className="text-zinc-500 text-sm mt-1">
                    Documentación nueva enviada por conductores · {profile?.city} · {subs.length} pendiente{subs.length !== 1 ? 's' : ''}
                </p>
            </div>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-400 rounded-full animate-spin" />
                </div>
            ) : subs.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                    <VamoIcon name="check-circle" className="h-12 w-12 mx-auto text-emerald-600" />
                    <p className="text-zinc-500">No hay renovaciones pendientes de revisión.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {subs.map(sub => (
                        <div key={sub.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-bold text-white">{sub.driverId}</p>
                                    <p className="text-[10px] font-mono text-zinc-500">{sub.municipalCode}</p>
                                </div>
                                <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                                    Pendiente de revisión
                                </span>
                            </div>

                            <div className="flex gap-6 flex-wrap text-xs">
                                <div>
                                    <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold mb-0.5">Documento</p>
                                    <p className="text-white font-bold">{DOC_LABELS[sub.docType] ?? sub.docType}</p>
                                </div>
                                <div>
                                    <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold mb-0.5">Fecha de envío</p>
                                    <p className="text-zinc-300">{formatDate(sub.uploadedAt)}</p>
                                </div>
                                {sub.documentExpiryDate && (
                                    <div>
                                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold mb-0.5">Vence</p>
                                        <p className="text-zinc-300">{formatDate(sub.documentExpiryDate)}</p>
                                    </div>
                                )}
                            </div>

                            {sub.storageUrl && (
                                <a href={sub.storageUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 underline">
                                    <VamoIcon name="external-link" className="h-3.5 w-3.5" />
                                    Ver documento
                                </a>
                            )}

                            <div className="flex gap-2">
                                <Button size="sm" disabled={!!busy}
                                    onClick={() => handleDecision(sub, true)}
                                    className="h-8 text-[10px] font-black uppercase tracking-widest bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/20">
                                    ✓ Aprobar renovación
                                </Button>
                                <Button size="sm" disabled={!!busy}
                                    onClick={() => handleDecision(sub, false, 'Documentación inválida o insuficiente')}
                                    className="h-8 text-[10px] font-black uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20">
                                    Rechazar
                                </Button>
                                <Link href={`/municipal/drivers/${sub.driverId}`} className="ml-auto">
                                    <button className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
                                        Ver conductor →
                                    </button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
