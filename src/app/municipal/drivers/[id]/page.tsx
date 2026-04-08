'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import {
    MunicipalProfile, MunicipalExpressStatus, MunicipalChecklist,
    MunicipalChecklistKey, DocItemStatus, CanonStatus, normalizeCityKey,
    MunicipalAuditAction,
} from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────
const CHECKLIST_LABELS: Record<MunicipalChecklistKey, string> = {
    dniFront:               'DNI — Frente',
    dniBack:                'DNI — Dorso',
    driverLicense:          'Licencia de conducir',
    vehicleInsurance:       'Seguro del vehículo',
    vehicleRegistrationCard:'Cédula del vehículo',
    criminalRecord:         'Antecedentes penales vigentes',
    municipalCanon:         'Canon municipal',
};
const CHECKLIST_KEYS = Object.keys(CHECKLIST_LABELS) as MunicipalChecklistKey[];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(ts: any) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isExpired(ts: any): boolean {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.getTime() < Date.now();
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function DocStatusBadge({ status }: { status: DocItemStatus }) {
    const cfg = {
        pending:   { label: 'Pendiente',  cls: 'bg-zinc-500/10 text-zinc-400' },
        submitted: { label: 'Presentado', cls: 'bg-blue-500/10 text-blue-400' },
        approved:  { label: 'Aprobado',   cls: 'bg-emerald-500/10 text-emerald-400' },
        observed:  { label: 'Observado',  cls: 'bg-orange-500/10 text-orange-400' },
    }[status];
    return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.cls)}>{cfg.label}</span>;
}

function MuniBadge({ status }: { status: MunicipalExpressStatus }) {
    const map: Partial<Record<MunicipalExpressStatus, { label: string; cls: string }>> = {
        pending_municipal_review:    { label: 'Pendiente de revisión', cls: 'bg-amber-500/10 text-amber-400' },
        municipal_observed:          { label: 'Observado',             cls: 'bg-orange-500/10 text-orange-400' },
        municipal_approved:          { label: 'Aprobado — en proceso', cls: 'bg-blue-500/10 text-blue-400' },
        active:                      { label: '✓ Habilitado',          cls: 'bg-emerald-500/10 text-emerald-400' },
        renewal_under_review:        { label: 'Renovación pendiente',  cls: 'bg-blue-500/10 text-blue-400' },
        suspended_expired_license:   { label: 'Suspendido — Lic. vencida',  cls: 'bg-red-500/10 text-red-400' },
        suspended_expired_insurance: { label: 'Suspendido — Seg. vencido',  cls: 'bg-red-500/10 text-red-400' },
        suspended_unpaid_canon:      { label: 'Suspendido — Canon impago',  cls: 'bg-red-500/10 text-red-400' },
        suspended_by_municipality:   { label: 'Suspendido por municipalidad', cls: 'bg-red-500/10 text-red-400' },
        rejected_by_municipality:    { label: 'Rechazado',             cls: 'bg-zinc-500/10 text-zinc-400' },
    };
    const cfg = map[status] ?? { label: status, cls: 'bg-zinc-500/10 text-zinc-400' };
    return <span className={cn('text-xs font-bold px-3 py-1 rounded-full', cfg.cls)}>{cfg.label}</span>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MunicipalDriverDetailPage() {
    const params    = useParams();
    const router    = useRouter();
    const firestore = useFirestore();
    const { profile, user } = useUser();
    const { toast } = useToast();
    const driverId  = params.id as string;

    const [mp, setMp]         = useState<MunicipalProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy]     = useState(false);

    // Inline edit states
    const [licDate,  setLicDate]  = useState('');
    const [insDate,  setInsDate]  = useState('');
    const [bgDate,   setBgDate]   = useState('');
    const [canDate,  setCanDate]  = useState('');
    const [obsText,  setObsText]  = useState('');

    const agentCityKey = profile?.city ? normalizeCityKey(profile.city) : null;

    useEffect(() => {
        if (!firestore || !driverId) return;
        const ref = doc(firestore, 'municipal_profiles', driverId);
        const unsub = onSnapshot(ref, snap => {
            if (snap.exists()) {
                const data = snap.data() as MunicipalProfile;
                setMp(data);
                setObsText(data.municipalObservation ?? '');
            }
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, [firestore, driverId]);

    // Security: only same city
    if (mp && agentCityKey && mp.cityKey !== agentCityKey) {
        return (
            <div className="py-20 text-center space-y-3">
                <VamoIcon name="ban" className="h-10 w-10 mx-auto text-red-500" />
                <p className="text-zinc-400 font-bold">Acceso denegado — conductor pertenece a otra municipalidad.</p>
                <Link href="/municipal/drivers"><button className="text-indigo-400 text-sm">← Volver</button></Link>
            </div>
        );
    }

    // ── Audit log helper ───────────────────────────────────────────────────────
    const logAction = async (action: MunicipalAuditAction, extra?: Record<string, any>) => {
        if (!firestore || !user || !mp) return;
        await addDoc(collection(firestore, 'municipal_audit_log'), {
            driverId,
            municipalCode: mp.municipalCode,
            cityKey: mp.cityKey,
            actionBy: user.uid,
            actionByRole: 'admin_municipal',
            action,
            ...extra,
            createdAt: serverTimestamp(),
        });
    };

    // ── Dual write helper: updates municipal_profiles + users/{uid} ────────────
    const dualUpdate = async (
        munData: Partial<MunicipalProfile>,
        userFields?: Record<string, any>,
    ) => {
        if (!firestore) return;
        await updateDoc(doc(firestore, 'municipal_profiles', driverId), {
            ...munData,
            updatedAt: serverTimestamp(),
        });
        if (userFields && Object.keys(userFields).length > 0) {
            await updateDoc(doc(firestore, 'users', driverId), {
                ...userFields,
                updatedAt: serverTimestamp(),
            });
        }
    };

    // ── ACCIONES ──────────────────────────────────────────────────────────────

    const handleChecklistItem = async (key: MunicipalChecklistKey, newStatus: DocItemStatus, obs?: string, expiryDate?: string) => {
        if (!mp) return;
        setBusy(true);
        try {
            const munData: any = {
                [`checklist.${key}.status`]: newStatus,
                [`checklist.${key}.reviewedAt`]: serverTimestamp(),
                [`checklist.${key}.reviewedBy`]: user?.uid ?? null,
                [`checklist.${key}.observation`]: obs ?? null,
            };

            // Mapeo de campos de vencimiento
            const expiryMap: Partial<Record<MunicipalChecklistKey, string>> = {
                driverLicense: 'licenseExpiry',
                vehicleInsurance: 'insuranceExpiry',
                criminalRecord: 'backgroundCheckExpiry',
            };

            if (newStatus === 'approved' && expiryMap[key] && expiryDate) {
                munData[expiryMap[key]!] = new Date(expiryDate + 'T12:00:00');
            }

            // Si está en renovación, y esto era lo último pendiente, volver a active
            if (mp.municipalStatus === 'renewal_under_review' && newStatus === 'approved') {
                const otherItemsPending = CHECKLIST_KEYS.filter(k => k !== key).some(k => mp.checklist?.[k]?.status === 'submitted');
                if (!otherItemsPending) {
                    munData.municipalStatus = 'active';
                }
            }

            await dualUpdate(munData, munData.municipalStatus ? { municipalStatus: 'active' } : undefined);
            await logAction(
                newStatus === 'approved' ? 'checklist_item_approved' : 'checklist_item_observed',
                { checklistKey: key, ...(obs ? { note: obs } : {}), ...(expiryDate ? { expiry: expiryDate } : {}) }
            );
            toast({ title: `${CHECKLIST_LABELS[key]} — ${newStatus === 'approved' ? 'Aprobado' : 'Observado'}` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(false); }
    };

    const handleCanon = async (paid: boolean, expiryDate?: string) => {
        setBusy(true);
        try {
            const canonStatus: CanonStatus = paid ? 'paid' : 'overdue';
            const munData: any = {
                canonStatus,
                ...(paid ? { canonPaidAt: serverTimestamp(), canonPaidBy: user?.uid } : {}),
            };

            if (paid) {
                let date: Date;
                if (expiryDate) {
                    date = new Date(expiryDate + 'T12:00:00');
                } else {
                    date = new Date();
                    date.setDate(date.getDate() + 30);
                }
                munData.canonExpiry = date;
            }

            await dualUpdate(munData);
            await logAction(paid ? 'canon_marked_paid' : 'canon_marked_overdue', { ...(munData.canonExpiry ? { expiry: munData.canonExpiry } : {}) });
            toast({ title: paid ? 'Canon marcado como pagado' : 'Canon marcado como vencido' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(false); }
    };

    const handleSetExpiry = async (field: 'licenseExpiry' | 'insuranceExpiry' | 'backgroundCheckExpiry' | 'canonExpiry', dateStr: string, action: MunicipalAuditAction) => {
        if (!dateStr) return;
        setBusy(true);
        try {
            const date = new Date(dateStr + 'T12:00:00');
            await dualUpdate({ [field]: date } as any);
            await logAction(action, { note: dateStr });
            toast({ title: 'Vencimiento guardado' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(false); }
    };

    const handleObservation = async () => {
        setBusy(true);
        try {
            await dualUpdate({ municipalObservation: obsText } as any);
            await logAction('observation_added', { note: obsText });
            toast({ title: 'Observación guardada' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(false); }
    };

    const handleEnable = async () => {
        setBusy(true);
        try {
            const prev = mp?.municipalStatus;
            await dualUpdate(
                { municipalStatus: 'active', enabledAt: serverTimestamp(), enabledBy: user?.uid, municipalObservation: null } as any,
                { approved: true, municipalStatus: 'active' }
            );
            await logAction('driver_enabled', { previousStatus: prev, newStatus: 'active' });
            toast({ title: '✅ Conductor habilitado', description: 'El conductor ya puede operar.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(false); }
    };

    const handleSuspend = async (reason: MunicipalExpressStatus) => {
        setBusy(true);
        try {
            const prev = mp?.municipalStatus;
            await dualUpdate(
                { municipalStatus: reason } as any,
                { approved: false, municipalStatus: reason }
            );
            await logAction('driver_suspended_by_municipality', { previousStatus: prev, newStatus: reason });
            toast({ title: 'Conductor suspendido', description: reason });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(false); }
    };

    const handleReject = async () => {
        if (!confirm('¿Rechazar definitivamente al conductor? Esta acción requiere acción manual para revertirse.')) return;
        setBusy(true);
        try {
            const prev = mp?.municipalStatus;
            await dualUpdate(
                { municipalStatus: 'rejected_by_municipality' } as any,
                { approved: false, municipalStatus: 'rejected_by_municipality' }
            );
            await logAction('driver_rejected', { previousStatus: prev, newStatus: 'rejected_by_municipality' });
            toast({ title: 'Conductor rechazado' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy(false); }
    };

    // ── Regla de habilitación ─────────────────────────────────────────────────
    const checklistOk = mp
        ? CHECKLIST_KEYS.every(k => mp.checklist?.[k]?.status === 'approved')
        : false;
    const canonOk        = mp?.canonStatus === 'paid' && !!mp?.canonExpiry && !isExpired(mp.canonExpiry);
    const licenseOk      = !!mp?.licenseExpiry && !isExpired(mp.licenseExpiry);
    const insuranceOk    = !!mp?.insuranceExpiry && !isExpired(mp.insuranceExpiry);
    const canEnable      = checklistOk && canonOk && licenseOk && insuranceOk
                           && mp?.municipalStatus !== 'active'
                           && mp?.municipalStatus !== 'rejected_by_municipality';

    if (loading) return (
        <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
        </div>
    );
    if (!mp) return (
        <div className="py-20 text-center text-zinc-500">
            Conductor no encontrado.
            <Link href="/municipal/drivers"><button className="block mx-auto mt-4 text-indigo-400 text-sm">← Volver</button></Link>
        </div>
    );

    return (
        <div className="space-y-6 max-w-3xl mx-auto pb-12">
            {/* ── BACK ─────────────────────────────────────────────────────── */}
            <Link href="/municipal/drivers">
                <button className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                    <VamoIcon name="arrow-left" className="h-3.5 w-3.5" /> Volver al listado
                </button>
            </Link>

            {/* ── HEADER CONDUCTOR ─────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-black text-white">{mp.driverName ?? '—'}</h1>
                        <p className="text-zinc-500 text-sm">{mp.driverPhone} · {mp.driverEmail}</p>
                    </div>
                    <MuniBadge status={mp.municipalStatus} />
                </div>
                <div className="flex gap-4 flex-wrap text-xs">
                    <div>
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">Código municipal</p>
                        <p className="font-mono text-white font-bold text-lg">{mp.municipalCode}</p>
                    </div>
                    <div>
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">Ciudad</p>
                        <p className="text-white font-bold">{mp.city}</p>
                    </div>
                    <div>
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">Alta</p>
                        <p className="text-white">{formatDate(mp.createdAt)}</p>
                    </div>
                    {mp.enabledAt && (
                        <div>
                            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">Habilitado</p>
                            <p className="text-emerald-400">{formatDate(mp.enabledAt)}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── CHECKLIST DOCUMENTAL ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Checklist Documental</p>
                    <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full',
                        checklistOk ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 bg-zinc-700/30'
                    )}>
                        {CHECKLIST_KEYS.filter(k => mp.checklist?.[k]?.status === 'approved').length}/{CHECKLIST_KEYS.length} aprobados
                    </span>
                </div>
                <div className="divide-y divide-white/5">
                    {CHECKLIST_KEYS.map(key => {
                        const item   = mp.checklist?.[key];
                        const status = (item?.status ?? 'pending') as DocItemStatus;
                        return (
                            <div key={key} className="px-5 py-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <VamoIcon
                                            name={status === 'approved' ? 'check-circle' : status === 'observed' ? 'alert-triangle' : status === 'submitted' ? 'clock' : 'file'}
                                            className={cn('h-4 w-4', status === 'approved' ? 'text-emerald-400' : status === 'observed' ? 'text-orange-400' : 'text-zinc-500')}
                                        />
                                        <span className="text-sm font-medium text-zinc-300">{CHECKLIST_LABELS[key]}</span>
                                        {item?.storageUrl && status === 'submitted' && (
                                            <a href={item.storageUrl} target="_blank" rel="noreferrer" className="ml-2 text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md hover:bg-indigo-500/20 transition-colors flex items-center gap-1">
                                                <VamoIcon name="external-link" className="w-3 h-3" /> Ver adjunto
                                            </a>
                                        )}
                                    </div>
                                    <DocStatusBadge status={status} />
                                </div>
                                {item?.observation && (
                                    <p className="text-xs text-orange-400/80 bg-orange-500/5 rounded-lg px-3 py-1.5 italic">
                                        Observación: {item.observation}
                                    </p>
                                )}
                                {/* Acciones */}
                                {status !== 'approved' && (
                                    <div className="flex gap-2 flex-wrap">
                                        <ApproveItemButton
                                            keyId={key}
                                            disabled={busy}
                                            needsExpiry={['driverLicense', 'vehicleInsurance', 'criminalRecord'].includes(key)}
                                            onConfirm={(expiry) => handleChecklistItem(key, 'approved', undefined, expiry)}
                                        />
                                        <ObserveItemButton disabled={busy} onObserve={obs => handleChecklistItem(key, 'observed', obs)} />
                                    </div>
                                )}
                                {status === 'approved' && (
                                    <button
                                        disabled={busy}
                                        onClick={() => handleChecklistItem(key, 'observed')}
                                        className="text-[10px] text-zinc-600 hover:text-orange-400 underline transition-colors"
                                    >
                                        Revertir a observado
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── VENCIMIENTOS ─────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5">
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Vencimientos</p>
                </div>
                <div className="divide-y divide-white/5">
                    {/* Licencia */}
                    <div className="px-5 py-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-zinc-300">Licencia de conducir</p>
                            <span className={cn('text-xs font-bold', mp.licenseExpiry ? (isExpired(mp.licenseExpiry) ? 'text-red-400' : 'text-emerald-400') : 'text-zinc-600')}>
                                {mp.licenseExpiry ? formatDate(mp.licenseExpiry) + (isExpired(mp.licenseExpiry) ? ' — VENCIDA' : '') : 'Sin cargar'}
                            </span>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Input type="date" value={licDate} onChange={e => setLicDate(e.target.value)}
                                className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40" />
                            <Button size="sm" disabled={busy || !licDate}
                                onClick={() => handleSetExpiry('licenseExpiry', licDate, 'license_expiry_set')}
                                className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20">
                                Guardar
                            </Button>
                        </div>
                    </div>
                    {/* Seguro */}
                    <div className="px-5 py-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-zinc-300">Seguro del vehículo</p>
                            <span className={cn('text-xs font-bold', mp.insuranceExpiry ? (isExpired(mp.insuranceExpiry) ? 'text-red-400' : 'text-emerald-400') : 'text-zinc-600')}>
                                {mp.insuranceExpiry ? formatDate(mp.insuranceExpiry) + (isExpired(mp.insuranceExpiry) ? ' — VENCIDO' : '') : 'Sin cargar'}
                            </span>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Input type="date" value={insDate} onChange={e => setInsDate(e.target.value)}
                                className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40" />
                            <Button size="sm" disabled={busy || !insDate}
                                onClick={() => handleSetExpiry('insuranceExpiry', insDate, 'insurance_expiry_set')}
                                className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20">
                                Guardar
                            </Button>
                        </div>
                    </div>
                    {/* Antecedentes */}
                    <div className="px-5 py-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-zinc-300">Antecedentes penales</p>
                            <span className={cn('text-xs font-bold', mp.backgroundCheckExpiry ? (isExpired(mp.backgroundCheckExpiry) ? 'text-red-400' : 'text-emerald-400') : 'text-zinc-600')}>
                                {mp.backgroundCheckExpiry ? formatDate(mp.backgroundCheckExpiry) + (isExpired(mp.backgroundCheckExpiry) ? ' — VENCIDO' : '') : 'Sin cargar'}
                            </span>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Input type="date" value={bgDate} onChange={e => setBgDate(e.target.value)}
                                className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40" />
                            <Button size="sm" disabled={busy || !bgDate}
                                onClick={() => handleSetExpiry('backgroundCheckExpiry', bgDate, 'background_check_expiry_set')}
                                className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20">
                                Guardar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── CANON ────────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Canon Municipal</p>
                    <span className={cn('text-sm font-bold',
                        mp.canonStatus === 'paid' ? 'text-emerald-400'
                        : mp.canonStatus === 'overdue' ? 'text-red-400'
                        : 'text-amber-400'
                    )}>
                        {mp.canonStatus === 'paid' ? '✓ Pagado' : mp.canonStatus === 'overdue' ? '✗ Vencido' : '⏳ Pendiente'}
                    </span>
                </div>
                <div className="space-y-1">
                    {mp.canonPaidAt && (
                        <p className="text-xs text-zinc-400">Pagado el: <span className="text-zinc-200 font-medium">{formatDate(mp.canonPaidAt)}</span></p>
                    )}
                    {mp.canonExpiry && (
                        <p className={cn("text-xs font-medium", isExpired(mp.canonExpiry) ? "text-red-400" : "text-zinc-400")}>
                            Vence el: <span className={cn("font-bold", isExpired(mp.canonExpiry) ? "text-red-400 underline" : "text-zinc-200")}>{formatDate(mp.canonExpiry)}</span>
                        </p>
                    )}
                </div>
                <div className="flex gap-2 items-center">
                    <Input type="date" value={canDate} onChange={e => setCanDate(e.target.value)}
                        className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40" />
                    <Button size="sm" disabled={busy || !canDate}
                        onClick={() => handleSetExpiry('canonExpiry', canDate, 'canon_expiry_set')}
                        className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20">
                        Guardar vencimiento
                    </Button>
                </div>
                <div className="flex gap-2 pt-2 border-t border-white/5">
                    <ApproveItemButton
                        label="✓ Marcar pagado"
                        disabled={busy || mp.canonStatus === 'paid'}
                        needsExpiry={true}
                        onConfirm={(expiry) => handleCanon(true, expiry)}
                        className="h-8 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/20"
                    />
                    <Button size="sm" disabled={busy}
                        onClick={() => handleCanon(false)}
                        className="h-8 text-[10px] font-black uppercase tracking-widest bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20">
                        Marcar vencido/impago
                    </Button>
                </div>
            </div>

            {/* ── OBSERVACIÓN ──────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Observación municipal</p>
                <p className="text-[10px] text-zinc-600">Este texto es visible para el conductor en su panel.</p>
                <textarea
                    value={obsText}
                    onChange={e => setObsText(e.target.value)}
                    rows={3}
                    placeholder="Indicá aquí qué debe corregir el conductor..."
                    className="w-full text-sm text-zinc-300 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 resize-none placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                />
                <Button size="sm" disabled={busy} onClick={handleObservation}
                    className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20">
                    Guardar observación
                </Button>
            </div>

            {/* ── ACCIONES PRINCIPALES ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Acciones municipales</p>

                {/* Botón HABILITAR — con regla completa */}
                <div className="space-y-2">
                    <Button
                        disabled={busy || !canEnable}
                        onClick={handleEnable}
                        className={cn(
                            'w-full h-12 text-sm font-black uppercase tracking-widest transition-all',
                            canEnable
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        )}
                    >
                        {mp.municipalStatus === 'active' ? '✓ Conductor ya habilitado' : '🏛 Habilitar conductor'}
                    </Button>
                    {!canEnable && mp.municipalStatus !== 'active' && (
                        <ul className="text-xs font-medium text-zinc-300 space-y-1 ml-1 mt-3">
                            {!checklistOk && <li>· Checklist: {CHECKLIST_KEYS.filter(k => mp.checklist?.[k]?.status !== 'approved').length} ítems sin aprobar</li>}
                            {!canonOk    && <li>· Canon municipal no pagado</li>}
                            {!licenseOk  && <li>· Vencimiento de licencia no cargado o vencido</li>}
                            {!insuranceOk && <li>· Vencimiento de seguro no cargado o vencido</li>}
                        </ul>
                    )}
                </div>

                {/* Suspend / Reject */}
                {mp.municipalStatus === 'active' && (
                    <div className="flex gap-2">
                        <Button size="sm" disabled={busy}
                            onClick={() => handleSuspend('suspended_by_municipality')}
                            className="flex-1 h-9 text-[10px] font-black uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20">
                            Suspender
                        </Button>
                        <Button size="sm" disabled={busy} onClick={handleReject}
                            className="flex-1 h-9 text-[10px] font-black uppercase tracking-widest bg-zinc-700/30 hover:bg-zinc-700/50 text-zinc-400 border border-zinc-600/20">
                            Rechazar
                        </Button>
                    </div>
                )}

                {/* Rechazar desde otros estados */}
                {mp.municipalStatus !== 'active' && mp.municipalStatus !== 'rejected_by_municipality' && (
                    <button disabled={busy} onClick={handleReject}
                        className="text-xs text-zinc-400 font-medium hover:text-red-400 transition-colors underline pt-2">
                        Rechazar definitivamente
                    </button>
                )}
            </div>
        </div>
    );
}

function ApproveItemButton({ keyId, disabled, needsExpiry, onConfirm, label = '✓ Aprobar', className }: { 
    keyId?: string; disabled: boolean; needsExpiry: boolean; onConfirm: (exp?: string) => void; label?: string; className?: string 
}) {
    const [open, setOpen] = useState(false);
    
    // Predeterminar +1 mes si es Canon
    const initialExpiry = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    }, []);

    const [expiry, setExpiry] = useState(initialExpiry);

    if (!open) return (
        <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}
            className={cn("h-7 text-[10px] font-black uppercase tracking-widest bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/20", className)}>
            {label}
        </Button>
    );

    return (
        <div className="flex gap-2 items-center flex-1 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
            {needsExpiry ? (
                <div className="flex flex-col gap-1.5 flex-1">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Nueva fecha de vencimiento:</p>
                    <div className="flex gap-2">
                        <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
                            className="flex-1 h-8 text-xs bg-black/40 border border-white/10 rounded-lg px-2 text-white focus:outline-none focus:border-emerald-500/50" />
                        <button disabled={!expiry} onClick={() => { onConfirm(expiry); setOpen(false); }}
                            className="h-8 px-4 text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded-lg disabled:opacity-50">Confirmar</button>
                        <button onClick={() => setOpen(false)} className="h-8 px-2 text-[10px] text-zinc-500 hover:text-zinc-300 uppercase font-bold">Cancelar</button>
                    </div>
                </div>
            ) : (
                <div className="flex gap-2">
                    <button onClick={() => { onConfirm(); setOpen(false); }}
                        className="h-8 px-4 text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded-lg">Confirmar aprobación</button>
                    <button onClick={() => setOpen(false)} className="h-8 px-2 text-[10px] text-zinc-500 hover:text-zinc-300 uppercase font-bold">Cancelar</button>
                </div>
            )}
        </div>
    );
}

// ─── Inline Observe Dialog ────────────────────────────────────────────────────
function ObserveItemButton({ disabled, onObserve }: { disabled: boolean; onObserve: (obs: string) => void }) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    if (!open) return (
        <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}
            className="h-7 text-[10px] font-black uppercase tracking-widest bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20">
            ⚠ Observar
        </Button>
    );
    return (
        <div className="flex gap-2 items-center flex-1">
            <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Motivo de la observación..."
                className="flex-1 h-7 text-xs bg-white/[0.04] border border-white/10 rounded-lg px-2 text-zinc-300 placeholder:text-zinc-700 focus:outline-none" />
            <button onClick={() => { onObserve(text); setOpen(false); setText(''); }}
                className="text-[10px] font-bold text-orange-400 hover:text-orange-300 px-2">OK</button>
            <button onClick={() => setOpen(false)} className="text-[10px] text-zinc-600 hover:text-zinc-400 px-1">✕</button>
        </div>
    );
}
