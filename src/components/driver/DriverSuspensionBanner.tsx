'use client';

import React from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { featureFlags } from '@/config/features';

interface DriverSuspensionBannerProps {
  profile: any;
}

export default function DriverSuspensionBanner({ profile }: DriverSuspensionBannerProps) {
  const router = useRouter();

  if (!profile) return null;

  const isSuspended =
    profile.isSuspended === true ||
    profile.trafficSuspended === true ||
    profile.municipalSuspended === true ||
    profile.adminSuspended === true;

  if (!isSuspended) return null;

  // Determine source
  let source: 'traffic' | 'municipal' | 'admin' | 'legacy' = 'legacy';
  if (profile.trafficSuspended === true || profile.suspensionSource === 'traffic') {
    source = 'traffic';
  } else if (profile.municipalSuspended === true || profile.suspensionSource === 'municipal') {
    source = 'municipal';
  } else if (profile.adminSuspended === true || profile.suspensionSource === 'admin') {
    source = 'admin';
  }

  // Define texts and icons
  let title = 'Cuenta Suspendida';
  let message = 'Tu cuenta se encuentra suspendida. Contactá soporte (soporte.vamo@gmail.com).';
  let reason = profile.suspensionReason || '';

  if (source === 'traffic') {
    title = 'Suspensión de Tránsito';
    message = 'Tu cuenta fue suspendida preventivamente por el área de Tránsito.';
    reason = profile.trafficSuspensionReason || profile.suspensionReason || '';
  } else if (source === 'municipal') {
    title = 'Suspensión Municipal';
    message = 'Tu habilitación fue suspendida por la Municipalidad.';
    reason = profile.municipalSuspensionReason || profile.suspensionReason || '';
  } else if (source === 'admin') {
    title = 'Suspensión Administrativa';
    message = 'Tu cuenta fue suspendida por Administración de VamO.';
    reason = profile.adminSuspensionReason || profile.suspensionReason || '';
  }

  return (
    <div className="p-4 rounded-2xl mb-4 border border-rose-500/20 bg-rose-500/10 text-rose-500 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <VamoIcon name="shield-off" className="h-5 w-5 text-rose-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm leading-tight uppercase tracking-wide">{title}</p>
          <p className="text-xs font-semibold opacity-90 mt-1 leading-relaxed">{message}</p>
          {reason && (
            <p className="text-[10px] opacity-75 mt-1.5 italic font-medium leading-snug">
              Motivo: "{reason}"
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 flex justify-end">
        {!featureFlags.vamoParticularModeEnabled && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 hover:text-white font-black text-xs uppercase tracking-wider transition-all"
            onClick={() => router.push('/driver/muni-status')}
          >
            Ver Habilitación
          </Button>
        )}
      </div>
    </div>
  );
}
