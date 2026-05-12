
'use client';

import React, { useEffect, useState } from 'react';
import { 
    collection, 
    query, 
    where, 
    onSnapshot,
    orderBy,
    limit
} from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface SystemAlert {
    id: string;
    type: 'LOW_SUPPLY' | 'HIGH_CANCELLATION' | 'PREDICTIVE_SHORTAGE';
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    createdAt: any;
    cityKey: string;
}

export function SystemAlerts({ cityKey }: { cityKey?: string }) {
    const firestore = useFirestore();
    const [alerts, setAlerts] = useState<SystemAlert[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;

        let q = query(
            collection(firestore, 'system_alerts'),
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc'),
            limit(5)
        );

        if (cityKey && cityKey !== 'global') {
            q = query(q, where('cityKey', '==', cityKey));
        }

        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as SystemAlert[];
            setAlerts(data);
            setLoading(false);
        }, (err) => {
            console.error("[ALERTS_WIDGET_ERROR]", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, cityKey]);

    if (loading) return null;
    if (alerts.length === 0) return null;

    return (
        <Card className="border-zinc-800 bg-zinc-900/20 backdrop-blur-xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <VamoIcon name="shield-alert" className="h-4 w-4 text-primary" />
                    Inteligencia en Tiempo Real
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {alerts.map((alert) => (
                    <div 
                        key={alert.id}
                        className={cn(
                            "p-3 rounded-2xl border transition-all animate-in fade-in slide-in-from-right-4",
                            alert.severity === 'critical' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                            alert.severity === 'warning' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                            "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        )}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest">{alert.title}</span>
                            <span className="text-[9px] opacity-60">
                                {alert.createdAt?.toDate ? formatDistanceToNow(alert.createdAt.toDate(), { addSuffix: true, locale: es }) : 'ahora'}
                            </span>
                        </div>
                        <p className="text-xs font-medium leading-tight">{alert.message}</p>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
