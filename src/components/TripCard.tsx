'use client';

const STATUS_LABELS: { [key: string]: string } = {
  idle: '¿A dónde vamos?',
  searching: 'Buscando conductor...',
  driver_found: 'Conductor asignado',
  on_the_way: 'Conductor en camino',
  arrived: 'El conductor llegó',
  in_trip: 'En viaje',
  finished: 'Viaje finalizado',
};

export function TripCard({ status, origin, destination }: { status: string, origin: string, destination: string }) {
  return (
    <div className="m-4 p-4 rounded-xl shadow bg-card">
      <span className="text-sm text-primary font-semibold">
        {STATUS_LABELS[status]}
      </span>

      <div className="mt-2 text-sm text-muted-foreground">
        <p><strong>Origen:</strong> {origin || 'Ubicación actual'}</p>
        <p><strong>Destino:</strong> {destination || '—'}</p>
      </div>
    </div>
  );
}
