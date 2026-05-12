'use client';
import React from 'react';
import { VamoIcon } from "./VamoIcon";
import { formatRating } from '@/lib/formatters';

export function DriverInfo({ driver }: { driver: any }) {
  if (!driver) return null;

  return (
    <div className="p-4 rounded-2xl bg-secondary flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center shadow-sm">
                <VamoIcon name="user" className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
                <p className="font-bold text-lg leading-none">{driver.name}</p>
                <div className="flex items-center gap-1 mt-1.5 text-sm text-muted-foreground">
                   <VamoIcon name="star" className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                   <span className="font-medium">{formatRating(driver.rating)}</span>
                </div>
            </div>
        </div>
        {driver.arrivalInfo && (
            <div className="text-right">
                 <p className="font-black text-2xl text-primary">{driver.arrivalInfo}</p>
            </div>
        )}
      </div>
      
      {(driver.vehicle || driver.plate) && (
          <div className="pt-3 flex items-center justify-between border-t border-border">
             <div className="flex items-center gap-2">
                <VamoIcon name="car" className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{driver.vehicle || 'Vehículo VamO'}</span>
             </div>
             {driver.plate && (
                 <div className="px-2.5 py-1 bg-background rounded-md border shadow-sm text-xs font-mono font-bold tracking-widest text-foreground">
                    {driver.plate.toUpperCase()}
                 </div>
             )}
          </div>
      )}
    </div>
  );
}
