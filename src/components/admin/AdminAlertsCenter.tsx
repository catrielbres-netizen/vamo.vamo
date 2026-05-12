'use client'

import React from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { VamoIcon } from '@/components/VamoIcon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export function AdminAlertsCenter({ cityKey }: { cityKey?: string }) {
    const firestore = useFirestore();

    // 1. FAP Claims (Pending / Reviewing)
    const fapQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'fap_claims'), 
            where('status', 'in', ['pending', 'reviewing']),
            limit(10)
        );
    }, [firestore]);
    const { data: fapClaims, error: fapErr } = useCollection(fapQuery);

    // 2. Withdrawals (Pending)
    const withdrawalsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'withdrawal_requests'),
            where('status', '==', 'pending'),
            limit(10)
        );
    }, [firestore]);
    const { data: withdrawals, error: wErr } = useCollection(withdrawalsQuery);

    // 3. Drivers Pending Municipal Approval
    const usersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'users'),
            where('municipalStatus', '==', 'pending_municipal_review'),
            limit(10)
        );
    }, [firestore]);
    const { data: pendingDrivers, error: uErr } = useCollection(usersQuery);

    const claims = React.useMemo(() => {
        if (!fapClaims) return [];
        return fapClaims; 
    }, [fapClaims]);

    const pendingWithdrawals = React.useMemo(() => {
        if (!withdrawals) return [];
        return withdrawals;
    }, [withdrawals]);

    const drivers = React.useMemo(() => {
        if (!pendingDrivers) return [];
        if (!cityKey || cityKey === 'global') return pendingDrivers;
        return pendingDrivers.filter((d: any) => d.cityKey === cityKey);
    }, [pendingDrivers, cityKey]);

    const unviewedFapCount = React.useMemo(() => {
        if (!fapClaims) return 0;
        return fapClaims.filter((c: any) => !c.adminViewedAt).length;
    }, [fapClaims]);

    const pendingWithdrawalsCount = withdrawals?.length || 0;
    const pendingDriversCount = drivers?.length || 0;

    const totalAlertsBadge = unviewedFapCount + pendingWithdrawalsCount + pendingDriversCount;
    const totalPendingList = (fapClaims?.length || 0) + pendingWithdrawalsCount + pendingDriversCount;

    // Fallback on severe index/permission errors without breaking navbar
    if (fapErr && wErr && uErr) {
        return (
            <div className="relative p-2 rounded-full opacity-50 cursor-not-allowed">
                 <VamoIcon name="bell-off" className="h-5 w-5 text-zinc-500" />
            </div>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="relative p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none">
                <VamoIcon name="bell" className="h-5 w-5 text-zinc-400 hover:text-white" />
                {totalAlertsBadge > 0 && (
                    <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white border border-black">
                        {totalAlertsBadge > 9 ? '9+' : totalAlertsBadge}
                    </span>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 bg-zinc-950 border border-white/10 text-white rounded-2xl shadow-xl shadow-black/50 p-2 z-50">
                <DropdownMenuLabel className="font-black uppercase tracking-widest text-[10px] text-zinc-500">Alertas del Sistema</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />

                {totalPendingList === 0 ? (
                    <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
                        <VamoIcon name="check-circle" className="h-8 w-8 text-emerald-500/50" />
                        <p className="text-zinc-500 text-sm font-medium">Sin alertas pendientes</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {claims.length > 0 && (
                            <Link href="/admin/claims">
                                <DropdownMenuItem className="cursor-pointer hover:bg-white/5 rounded-xl flex flex-col items-start gap-1 p-3">
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2 text-blue-400">
                                            <VamoIcon name="heart-pulse" className="h-4 w-4" />
                                            <span className="font-bold text-sm">Reclamos FAP</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {unviewedFapCount > 0 && <Badge variant="destructive" className="bg-red-500 text-white border-0 text-[8px] px-1 h-4">NUEVOS</Badge>}
                                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-0">{claims.length}</Badge>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Hay {claims.length} reclamo(s) por revisar.</p>
                                </DropdownMenuItem>
                            </Link>
                        )}

                        {pendingWithdrawals.length > 0 && (
                            <Link href="/admin/withdrawals">
                                <DropdownMenuItem className="cursor-pointer hover:bg-white/5 rounded-xl flex flex-col items-start gap-1 p-3">
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2 text-emerald-400">
                                            <VamoIcon name="banknote" className="h-4 w-4" />
                                            <span className="font-bold text-sm">Retiros Pendientes</span>
                                        </div>
                                        <Badge variant="destructive" className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-0">{pendingWithdrawals.length}</Badge>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Hay {pendingWithdrawals.length} retiro(s) pendiente(s).</p>
                                </DropdownMenuItem>
                            </Link>
                        )}

                        {drivers.length > 0 && (
                            <Link href="/municipal/dashboard">
                                <DropdownMenuItem className="cursor-pointer hover:bg-white/5 rounded-xl flex flex-col items-start gap-1 p-3">
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2 text-amber-400">
                                            <VamoIcon name="shield-alert" className="h-4 w-4" />
                                            <span className="font-bold text-sm">Conductores Muni</span>
                                        </div>
                                        <Badge variant="destructive" className="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-0">{drivers.length}</Badge>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Falta revisión en {drivers.length} legajo(s).</p>
                                </DropdownMenuItem>
                            </Link>
                        )}
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
