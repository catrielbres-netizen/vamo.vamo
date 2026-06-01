'use client';

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';

interface MercadoPagoLinkCardProps {
    /** Estado de vinculación: 'linked' | 'expired' | undefined/null = no vinculado */
    mpAccountStatus?: string | null;
    /** Fecha de vinculación (para mostrar al usuario) */
    mpLinkedAt?: any;
    /** Clase adicional para el card wrapper */
    className?: string;
    /** Variante compacta (para banner en billetera) */
    compact?: boolean;
}

export function MercadoPagoLinkCard({
    mpAccountStatus,
    mpLinkedAt,
    className,
    compact = false,
}: MercadoPagoLinkCardProps) {
    const firebaseApp = useFirebaseApp();
    const { toast } = useToast();
    const [isLinking, setIsLinking] = useState(false);

    const isLinked = mpAccountStatus === 'linked';
    const isExpired = mpAccountStatus === 'expired';

    const handleLinkMercadoPago = async () => {
        if (!firebaseApp) return;
        setIsLinking(true);
        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            const getUrl = httpsCallable(functions, 'createMercadoPagoOAuthUrlV1');
            const result = await getUrl();
            const data = result.data as { url: string };
            if (data?.url) {
                window.location.href = data.url;
            }
        } catch (e: any) {
            console.error('[MP_LINK] Error:', e);
            toast({
                variant: 'destructive',
                title: 'Error al iniciar vinculación',
                description: e.message || 'No se pudo iniciar el proceso. Intentá de nuevo.',
            });
        } finally {
            setIsLinking(false);
        }
    };

    // Formato fecha de vinculación
    const linkedDateStr = React.useMemo(() => {
        if (!mpLinkedAt) return null;
        try {
            const d = mpLinkedAt?.toDate ? mpLinkedAt.toDate() : new Date(mpLinkedAt);
            return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch {
            return null;
        }
    }, [mpLinkedAt]);

    if (compact) {
        // Versión banner para billetera
        if (isLinked) {
            return (
                <div className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl border",
                    "bg-emerald-500/10 border-emerald-500/20",
                    className
                )}>
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <VamoIcon name="check-circle" className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-emerald-400 uppercase tracking-widest leading-none">Mercado Pago Vinculado</p>
                        {linkedDateStr && (
                            <p className="text-[10px] text-emerald-500/60 font-medium mt-0.5">Vinculado el {linkedDateStr}</p>
                        )}
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[8px] font-black shrink-0">
                        ACTIVO
                    </Badge>
                </div>
            );
        }

        return (
            <div className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border",
                isExpired
                    ? "bg-red-500/10 border-red-500/20"
                    : "bg-blue-500/10 border-blue-500/20",
                className
            )}>
                <div className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                    isExpired ? "bg-red-500/20" : "bg-blue-500/20"
                )}>
                    <VamoIcon name={isExpired ? "alert-triangle" : "link"} className={cn("w-5 h-5", isExpired ? "text-red-400" : "text-blue-400")} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-black uppercase tracking-widest leading-none", isExpired ? "text-red-400" : "text-blue-400")}>
                        {isExpired ? "Mercado Pago vencido" : "Vinculá Mercado Pago"}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-medium mt-0.5 leading-tight">
                        {isExpired
                            ? "Renová el permiso para habilitar pagos digitales."
                            : "Para validar tu identidad y habilitar pagos digitales."}
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={handleLinkMercadoPago}
                    disabled={isLinking}
                    className={cn(
                        "h-9 rounded-xl font-black text-[10px] uppercase tracking-widest shrink-0",
                        isExpired ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                    )}
                >
                    {isLinking ? <VamoIcon name="loader" className="animate-spin h-4 w-4" /> : (isExpired ? "Renovar" : "Vincular")}
                </Button>
            </div>
        );
    }

    // Versión completa (para tab de Pagos en perfil)
    return (
        <Card className={cn("border-blue-500/30 bg-blue-500/5", isLinked && "border-emerald-500/20 bg-emerald-500/5", isExpired && "border-red-500/20 bg-red-500/5", className)}>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <CardTitle className={cn("text-lg flex gap-2 items-center", isLinked ? "text-emerald-400" : isExpired ? "text-red-400" : "text-blue-400")}>
                        <VamoIcon name="credit-card" className="w-5 h-5" />
                        Mercado Pago
                    </CardTitle>
                    <Badge
                        variant={isLinked ? 'default' : isExpired ? 'destructive' : 'secondary'}
                        className="uppercase font-black text-[9px]"
                    >
                        {isLinked ? 'Vinculado' : isExpired ? 'Vencido' : 'No Vinculado'}
                    </Badge>
                </div>
                <CardDescription className={cn("font-medium text-xs", isLinked ? "text-emerald-500/70" : "text-blue-400")}>
                    {isLinked
                        ? "Tu cuenta de Mercado Pago está vinculada correctamente."
                        : "Vinculá tu cuenta para validar tu identidad y habilitar pagos digitales."}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="p-4 bg-background/40 rounded-xl border border-border/50 text-center">
                    {isLinked ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                <VamoIcon name="check-circle" className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-black text-white">Mercado Pago vinculado correctamente</p>
                                {linkedDateStr && (
                                    <p className="text-xs text-zinc-500 mt-1">Vinculado el {linkedDateStr}</p>
                                )}
                            </div>
                            <p className="text-[10px] text-zinc-600 font-medium italic">
                                Tus tokens y datos de acceso están protegidos y nunca se muestran en pantalla.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleLinkMercadoPago}
                                disabled={isLinking}
                                className="mt-1 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                            >
                                {isLinking ? 'Cargando...' : 'Actualizar vinculación'}
                            </Button>
                        </div>
                    ) : isExpired ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
                                <VamoIcon name="alert-triangle" className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-black text-red-400">Autorización vencida</p>
                                <p className="text-xs text-zinc-500 mt-1">Debés renovar el permiso de Mercado Pago para seguir operando.</p>
                            </div>
                            <Button
                                onClick={handleLinkMercadoPago}
                                disabled={isLinking}
                                className="w-full bg-red-600 hover:bg-red-700 font-black rounded-xl"
                            >
                                {isLinking ? 'Cargando...' : 'Re-vincular Mercado Pago'}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                <VamoIcon name="link" className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-black text-white">No estás vinculado</p>
                                <p className="text-xs text-zinc-500 mt-1">
                                    Para solicitar viajes necesitás vincular Mercado Pago y validar tu identidad.
                                </p>
                            </div>
                            <Button
                                onClick={handleLinkMercadoPago}
                                disabled={isLinking}
                                className="w-full bg-blue-600 hover:bg-blue-700 font-black rounded-xl h-12"
                                id="btn-vincular-mercadopago"
                            >
                                {isLinking
                                    ? <><VamoIcon name="loader" className="animate-spin h-4 w-4 mr-2" />Iniciando...</>
                                    : 'Vincular Mercado Pago'}
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
