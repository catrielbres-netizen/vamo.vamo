'use client';

import React from 'react';
import { useFCM } from '@/hooks/useFCM';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';

export function NotificationToggle() {
    const { status, enablePush, error, supported } = useFCM();

    if (!supported) {
        return (
            <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground bg-muted/30 rounded-lg">
                <VamoIcon name="bell-off" className="w-4 h-4 opacity-50" />
                <span>Notificaciones no soportadas en este navegador</span>
            </div>
        );
    }

    if (status === 'enabled') {
        return (
            <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <div className="relative">
                    <VamoIcon name="bell" className="w-4 h-4" />
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                </div>
                <span>Notificaciones activadas</span>
            </div>
        );
    }

    if (status === 'blocked') {
        return (
            <div className="flex flex-col gap-1 px-3 py-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2 font-medium">
                    <VamoIcon name="bell-off" className="w-4 h-4" />
                    <span>Permiso bloqueado</span>
                </div>
                <span className="text-xs opacity-80">Por favor habilita las notificaciones desde los ajustes de tu navegador.</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <Button
                onClick={() => enablePush(true)}
                disabled={status === 'loading'}
                variant="outline"
                className="w-full flex items-center justify-start gap-3 h-auto py-3 px-4 border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors"
            >
                {status === 'loading' ? (
                    <VamoIcon name="loader" className="w-4 h-4 animate-spin text-primary" />
                ) : (
                    <VamoIcon name="bell-plus" className="w-4 h-4 text-primary" />
                )}
                <span className="font-semibold">
                    {status === 'loading' ? 'Activando...' : 
                     status === 'failed' ? 'Reintentar' : 
                     'Activar notificaciones'}
                </span>
            </Button>
            {error && (
                <span className="text-xs text-destructive font-medium px-1">{error}</span>
            )}
        </div>
    );
}
