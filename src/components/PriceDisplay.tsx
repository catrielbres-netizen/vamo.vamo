'use client';

export function PriceDisplay({ price, isNight }: { price: number, isNight: boolean }) {
  return (
    <div className="m-4 p-4 rounded-xl bg-secondary text-center">
      <p className="text-xs text-muted-foreground">
        Tarifa {isNight ? 'nocturna' : 'diurna'} estimada
      </p>
      <p className="text-3xl font-bold text-primary">${new Intl.NumberFormat('es-AR').format(price)}</p>
      <p className="text-xs text-muted-foreground">
        Puede variar por tiempo de espera
      </p>
    </div>
  );
}
