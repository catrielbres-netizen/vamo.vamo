
'use client';

import React from 'react';
import { RideStatusInfo } from '@/lib/ride-status';
import { Progress } from './ui/progress';
import { Place } from '@/lib/types';
import { VamoIcon } from './VamoIcon';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';


export function TripCard({
  status,
  origin,
  destination,
}: {
  status: string;
  origin: Place | null;
  destination: Place | null;
}) {
  const statusInfo = RideStatusInfo[status as keyof typeof RideStatusInfo] || {
    text: '¿A dónde vamos?',
    icon: 'search',
    progress: 0,
  };
  
  const iconClass = status === 'in_progress' ? "animate-pulse" : "";

  // Special, more appealing layout for the 'searching' state
  if (status === 'searching') {
    return (
      <div className="m-4 p-4 rounded-xl shadow-lg bg-card">
        <div className="text-center mb-4">
            <VamoIcon name={statusInfo.icon} className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
            <h2 className="text-lg font-bold text-primary">{statusInfo.text}</h2>
        </div>
        <div className="space-y-2 text-sm border-t pt-4">
          <div className="flex items-start">
              <VamoIcon name="map-pin" className="w-4 h-4 mr-2 mt-1 text-muted-foreground"/>
              <div>
                  <p className="text-muted-foreground text-xs">Desde</p>
                  <p className="font-medium">{origin?.address || 'No especificado'}</p>
              </div>
          </div>
          <div className="flex items-start">
              <VamoIcon name="flag" className="w-4 h-4 mr-2 mt-1 text-muted-foreground"/>
              <div>
                  <p className="text-muted-foreground text-xs">Hasta</p>
                  <p className="font-medium">{destination?.address || '—'}</p>
              </div>
          </div>
        </div>
      </div>
    );
  }

  // Original layout for all other statuses
  return (
    <div className="m-4 p-4 rounded-xl shadow-lg bg-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-6 flex justify-center">
            <VamoIcon name={statusInfo.icon} className={iconClass} />
        </div>
        <span className="text-sm text-primary font-semibold">
          {statusInfo.text}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-start">
            <VamoIcon name="map-pin" className="w-4 h-4 mr-2 mt-1 text-muted-foreground"/>
            <div>
                <p className="text-muted-foreground text-xs">Desde</p>
                <p className="font-medium">{origin?.address || 'No especificado'}</p>
            </div>
        </div>
        <div className="flex items-start">
            <VamoIcon name="flag" className="w-4 h-4 mr-2 mt-1 text-muted-foreground"/>
            <div>
                <p className="text-muted-foreground text-xs">Hasta</p>
                <p className="font-medium">{destination?.address || '—'}</p>
            </div>
        </div>
      </div>
      
      <Progress value={statusInfo.progress} className="w-full h-2 mt-4" />
    </div>
  );
}
