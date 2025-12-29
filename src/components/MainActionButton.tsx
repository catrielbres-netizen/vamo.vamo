'use client';

import { Button } from './ui/button';

export function MainActionButton({ status, onClick }: { status: string, onClick: () => void }) {
  const LABELS: { [key: string]: string } = {
    idle: 'Pedir viaje',
    searching: 'Cancelar búsqueda',
    driver_found: 'Cancelar viaje',
    on_the_way: 'Cancelar viaje',
    arrived: 'Cancelar viaje',
    finished: 'Pedir otro viaje',
  };

  const isDestructive = ['searching', 'driver_found'].includes(status);

  if (!LABELS[status]) return null;

  return (
    <div className="m-4">
      <Button
        onClick={onClick}
        className="w-full"
        size="lg"
        variant={isDestructive ? "destructive" : "default"}
      >
        {LABELS[status]}
      </Button>
    </div>
  );
}
