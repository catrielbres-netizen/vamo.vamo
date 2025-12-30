'use client';

export function PriceDisplay({ price, isNight, originalPrice }: { price: number, isNight: boolean, originalPrice?: number }) {
  const format = (p: number) => new Intl.NumberFormat('es-AR').format(p);

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
      <p className="text-3xl font-bold text-primary">${format(price)}</p>
      <p className="text-xs text-muted-foreground">
        Puede variar por tiempo de espera
      </p>
    </div>
  );
}
