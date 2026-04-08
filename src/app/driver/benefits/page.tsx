'use client';

import React, { useState } from 'react';
import { useUser } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Benefit } from '@/lib/types';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';

// Helpers
const getIconForType = (type: string) => {
    switch (type) {
        case 'combustible': return 'fuel';
        case 'taller': return 'wrench';
        case 'lavadero': return 'droplets';
        case 'repuestos': return 'settings';
        default: return 'gift';
    }
};

const getColorForType = (type: string) => {
    switch (type) {
        case 'combustible': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
        case 'taller': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
        case 'lavadero': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
        case 'repuestos': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
        default: return 'bg-primary/10 text-primary border-primary/20';
    }
};

export default function BenefitsPage() {
    const { profile, loading: isLoading } = useUser();
    const firestore = useFirestore();
    
    // State for the QR Modal
    const [selectedBenefit, setSelectedBenefit] = useState<Benefit | null>(null);

    // Fetch active benefits from Firestore
    const benefitsQuery = firestore ? query(
        collection(firestore, 'benefits'),
        where('isActive', '==', true),
        orderBy('name', 'asc')
    ) : null;
    
    const { data: benefits, isLoading: isBenefitsLoading } = useCollection<Benefit>(benefitsQuery);

    if (isLoading || isBenefitsLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
        );
    }
    
    const isEligible = profile?.approved === true && profile?.driverStatus !== 'inactive';

    const displayBenefits = benefits?.filter(b => {
        // Filtrar por ciudad robustamente
        if (profile?.city && b.city) {
            const benefitCity = (b.city || '').trim().toLowerCase();
            const driverCity = (profile.city || '').trim().toLowerCase();
            return benefitCity === driverCity;
        }
        return true;
    }) || [];

    // --- TEMPORAL DEBUG LOGS ---
    console.log("DEBUG BENEFITS: profile.city =", profile?.city);
    console.log("DEBUG BENEFITS: Total beneficios activos recibidos =", benefits?.length, benefits);
    console.log("DEBUG BENEFITS: Total después del filtro =", displayBenefits.length, displayBenefits);
    // ---------------------------

    const renderQRModal = () => {
        if (!selectedBenefit) return null;
        const now = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
        const manualCode = `VAMO-${profile?.id?.substring(0,6).toUpperCase()}`;

        return (
            <Dialog open={!!selectedBenefit} onOpenChange={(open) => !open && setSelectedBenefit(null)}>
                <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-slate-50 dark:bg-zinc-950">
                    <DialogHeader className="mb-2">
                        <DialogTitle className="text-xl font-bold flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <VamoIcon name="ticket" className="text-primary" />
                                Beneficio Activo
                            </span>
                            <span className="text-xs font-normal text-muted-foreground">{now} hs</span>
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-border/50">
                        <div className="text-center mb-6">
                            <h2 className="text-2xl font-black text-primary leading-none mb-1">{selectedBenefit.merchantName}</h2>
                            <p className="text-sm font-semibold text-muted-foreground">{selectedBenefit.name}</p>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-white rounded-xl border border-border/50 mb-4 mix-blend-multiply dark:mix-blend-normal">
                            <QRCodeSVG 
                                value={`vamo://benefit/${selectedBenefit.id}?driverId=${profile?.id}`}
                                size={180}
                                level="H"
                                includeMargin={false}
                            />
                        </div>
                        
                        <p className="text-xs text-muted-foreground mb-1">Código de Autorización</p>
                        <p className="text-xl font-mono font-bold tracking-widest text-foreground bg-slate-100 dark:bg-zinc-800 px-4 py-2 rounded-xl border mb-6">
                            {manualCode}
                        </p>
                        
                        <div className="w-full bg-slate-50 dark:bg-zinc-800 rounded-xl p-4 text-left border">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Conductor Habilitado</p>
                            <h3 className="font-bold text-foreground leading-none">{profile?.name}</h3>
                            <p className="text-xs text-muted-foreground font-mono mt-1">ID: {profile?.id?.substring(0, 8) || '0000'}</p>
                        </div>
                        
                        <div className="flex w-full items-center justify-center gap-2 mt-4 text-green-700 dark:text-green-400 bg-green-500/10 px-4 py-3 rounded-xl border border-green-500/20">
                            <VamoIcon name="check-circle" className="w-5 h-5" />
                            <span className="text-sm font-bold uppercase tracking-wider text-center leading-tight">Habilitado para Descuento</span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    };

    const LEVEL_VALUES: Record<string, number> = {
        bronce: 0,
        plata: 1,
        oro: 2
    };

    const driverLevelValue = LEVEL_VALUES[profile?.driverLevel || 'bronce'];

    return (
        <div className="space-y-6 pb-20">
            <div className="mb-6">
                <h2 className="text-2xl font-black mb-1">Club VamO</h2>
                <p className="text-muted-foreground text-sm">Descuentos exclusivos para conductores activos.</p>
            </div>

            {!isEligible && (
                <Alert variant="destructive" className="border-red-400 bg-red-50 dark:bg-red-900/30 rounded-2xl">
                    <VamoIcon name="alert-triangle" className="h-5 w-5 text-red-500" />
                    <AlertTitle className="text-red-700 dark:text-red-300 font-bold">Beneficios Bloqueados</AlertTitle>
                    <AlertDescription className="text-red-600 dark:text-red-400">
                        Tu perfil debe estar aprobado y activo para utilizar estos descuentos.
                    </AlertDescription>
                </Alert>
            )}

            {displayBenefits.length === 0 ? (
                <div className="text-center py-10 opacity-70">
                    <VamoIcon name="gift" className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-semibold">No hay beneficios disponibles en tu ciudad por ahora.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {displayBenefits.map(benefit => {
                        const requiredLevel = benefit.minLevel || 'bronce';
                        const requiredLevelValue = LEVEL_VALUES[requiredLevel];
                        const isLocked = driverLevelValue < requiredLevelValue;

                        return (
                            <Card key={benefit.id} className={cn(
                                "overflow-hidden rounded-2xl border-border/60 shadow-sm transition-all",
                                isLocked ? "opacity-60 bg-slate-50/50 grayscale-[0.5]" : "hover:shadow-md"
                            )}>
                                <CardHeader className="pb-3 pt-5 px-5">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="space-y-1.5">
                                            <div className="flex gap-2">
                                                <Badge variant="outline" className={cn("uppercase tracking-wider text-[10px]", getColorForType(benefit.type))}>
                                                    <VamoIcon name={getIconForType(benefit.type)} className="w-3 h-3 mr-1.5" />
                                                    {benefit.merchantName || benefit.type}
                                                </Badge>
                                                {isLocked && (
                                                    <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-[9px] font-black uppercase tracking-widest">
                                                        Nivel {requiredLevel}
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardTitle className="text-lg font-bold leading-tight">{benefit.name}</CardTitle>
                                        </div>
                                        <div className={cn(
                                            "font-black text-xl px-3 py-1.5 rounded-xl shadow-sm shrink-0",
                                            isLocked ? "bg-zinc-200 text-zinc-500" : "bg-primary text-primary-foreground"
                                        )}>
                                            -{benefit.discountPercent}%
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-5 pb-4 text-sm space-y-4">
                                    <p className="text-muted-foreground leading-relaxed">
                                        {isLocked ? "Mejorá tu nivel para desbloquear este beneficio exclusivo." : benefit.description}
                                    </p>
                                    
                                    {!isLocked && (
                                        <div className="space-y-2.5 pt-3 border-t">
                                            {benefit.conditions && (
                                                <div className="flex items-start gap-2 text-muted-foreground text-xs">
                                                    <VamoIcon name="users" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground/50" />
                                                    <div>
                                                        <span className="font-semibold text-foreground/80 block">Quién puede usarlo:</span>
                                                        <span className="italic">{benefit.conditions}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {benefit.limitDescription && (
                                                <div className="flex items-start gap-2 text-muted-foreground text-xs">
                                                    <VamoIcon name="info" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground/50" />
                                                    <div>
                                                        <span className="font-semibold text-foreground/80 block">Tope / Límite:</span>
                                                        <span>{benefit.limitDescription}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {benefit.applicationMethod && (
                                                <div className="flex items-start gap-2 text-muted-foreground text-xs">
                                                    <VamoIcon name="smartphone" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground/50" />
                                                    <div>
                                                        <span className="font-semibold text-foreground/80 block">Cómo se aplica:</span>
                                                        <span>{benefit.applicationMethod}</span>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex items-start gap-2 text-muted-foreground text-xs">
                                                <VamoIcon name="map-pin" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground/50" />
                                                <div>
                                                    <span className="font-semibold text-foreground/80 block">Dirección:</span>
                                                    <span>{benefit.address}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                                <CardFooter className="px-5 pb-5 pt-0">
                                    <Button 
                                        className={cn(
                                            "w-full rounded-xl font-bold h-11 uppercase tracking-widest text-xs",
                                            isLocked ? "bg-zinc-800 text-zinc-500 hover:bg-zinc-800" : ""
                                        )} 
                                        disabled={!isEligible || isLocked}
                                        onClick={() => setSelectedBenefit(benefit)}
                                    >
                                        {isLocked ? (
                                            <span className="flex items-center gap-2">
                                                <VamoIcon name="lock" className="w-3.5 h-3.5" />
                                                Nivel {requiredLevel} Requerido
                                            </span>
                                        ) : "Usar Beneficio"}
                                    </Button>
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>
            )}
            
            {renderQRModal()}
        </div>
    );
}
