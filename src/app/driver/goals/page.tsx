'use client';

import React from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DriverLevel } from '@/lib/types';

function formatCurrency(value: number | undefined) {
    if (typeof value !== 'number') return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
}

const levelInfo: Record<DriverLevel, { next: DriverLevel | null, goal: number, badge: string }> = {
    bronce: { next: "plata", goal: 50, badge: "bg-yellow-700/20 text-yellow-800 border-yellow-700/30" },
    plata: { next: "oro", goal: 100, badge: "bg-gray-400/20 text-gray-500 border-gray-400/30" },
    oro: { next: null, goal: 100, badge: "bg-yellow-400/20 text-yellow-500 border-yellow-400/30" },
};

export default function GoalsPage() {
    const { profile, loading: isLoading } = useUser();

    if (isLoading || !profile) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        );
    }
    
    const ridesCompleted = profile?.stats?.ridesCompleted ?? 0;
    const PROMO_RIDE_THRESHOLD = 10;
    const isInPromoPeriod = profile?.promoCreditGranted && ridesCompleted < PROMO_RIDE_THRESHOLD;
    
    // Data is now sourced from the user's profile, assuming the `useUser` hook was updated to provide it.
    const weeklyPoints = (profile as any).pointsData?.weeklyPoints ?? 0;
    const totalPoints = profile.rewardPoints ?? 0;
    const currentLevel = profile.driverLevel ?? 'bronce';
    const levelData = levelInfo[currentLevel];
    
    const poolAmount = (profile as any).rewardsConfig?.weeklyPoolAmount ?? 2000;
    const minPointsToQualify = (profile as any).rewardsConfig?.minPointsToQualify ?? 20;

    const progressPercentage = levelData.goal ? (totalPoints / levelData.goal) * 100 : 100;

    return (
        <div className="space-y-6">
            {isInPromoPeriod && (
                <Alert variant="default" className="border-blue-400 bg-blue-50 dark:bg-blue-900/30">
                    <VamoIcon name="info" className="h-4 w-4 text-blue-500" />
                    <AlertTitle className="text-blue-700 dark:text-blue-300">¡Estás en tu período de bienvenida!</AlertTitle>
                    <AlertDescription className="text-blue-600 dark:text-blue-500">
                        Recibiste un bono para cubrir tus primeras comisiones. Durante los primeros {PROMO_RIDE_THRESHOLD} viajes, no acumularás puntos para niveles o el pozo. ¡A rodar!
                    </AlertDescription>
                </Alert>
            )}

            <Card className={isInPromoPeriod ? 'opacity-50' : ''}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <VamoIcon name="star" className="text-primary" /> Mi Progreso
                    </CardTitle>
                    <CardDescription>
                        Acumulá puntos con cada viaje para subir de nivel y obtener mejores beneficios.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="text-sm text-muted-foreground">Nivel Actual</p>
                             <Badge variant="outline" className={cn("capitalize text-base mt-1", levelData.badge)}>
                                {currentLevel}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Puntos Totales</p>
                            <p className="text-3xl font-bold">{totalPoints}</p>
                        </div>
                    </div>
                    {levelData.next && (
                        <div className="space-y-2">
                            <Progress value={progressPercentage} />
                            <p className="text-center text-xs text-muted-foreground">
                                Te faltan {Math.max(0, levelData.goal - totalPoints)} puntos para alcanzar el nivel {levelData.next}.
                            </p>
                        </div>
                    )}
                     <div className="text-center text-xs text-muted-foreground space-y-1 pt-2 border-t">
                        <p>Viajes <span className="font-bold">Express</span> suman <span className="font-bold">3 puntos</span>. Viajes <span className="font-bold">Premium</span> suman <span className="font-bold">1 punto</span>.</p>
                        <p>¡Los puntos te dan prioridad para recibir los mejores viajes!</p>
                    </div>
                </CardContent>
            </Card>

            <Card className={isInPromoPeriod ? 'opacity-50' : ''}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><VamoIcon name="award" /> Pozo Semanal de Recompensas</CardTitle>
                    <CardDescription>
                       Un pozo que crece con cada viaje en la plataforma. ¡Más viajes, más grande el premio! Se reparte los lunes.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="text-sm text-muted-foreground">Pozo actual (¡en vivo!)</p>
                            <p className="text-3xl font-bold text-primary">{formatCurrency(poolAmount)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Tus puntos esta semana</p>
                            <p className="text-3xl font-bold">{weeklyPoints}</p>
                        </div>
                    </div>
                     <div className="text-center text-xs text-muted-foreground space-y-1 pt-2 border-t">
                        <p>El pozo arranca en {formatCurrency(2000)} y crece con el 1% de cada viaje realizado en VamO.</p>
                        <p>Necesitás al menos {minPointsToQualify} puntos para calificar para el reparto proporcional.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
