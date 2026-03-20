
'use client';

import React from 'react';
import { VamoIcon } from './VamoIcon';
export function PriceDisplay({ price, isNight, originalPrice }: { price: number, isNight: boolean, originalPrice?: number }) {
  const format = (p: number) => new Intl.NumberFormat('es-AR').format(p);

  if (price === -1) {
    return (
        <div className="m-4 p-4 rounded-xl bg-secondary text-center">
            <VamoIcon name="loader" className="h-8 w-8 animate-spin mx-auto text-primary"/>
            <p className="text-xs text-muted-foreground mt-2">Calculando tarifa...</p>
        </div>
    );
  }

  return (
    <div className="m-4 p-4 rounded-xl bg-secondary text-center">
      {originalPrice && (
        <p className="text-sm text-muted-foreground line-through">
            ${format(originalPrice)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Tarifa {isNight ? 'nocturna' : 'diurna'} estimada {originalPrice ? 'con bono' : ''}
      </p>
      <p className="text-3xl font-bold text-primary [text-shadow:1px_1px_2px_black]">${format(price)}</p>
      <p className="text-xs text-muted-foreground">
        Puede variar por tiempo de espera
      </p>
    </div>
  );
}
