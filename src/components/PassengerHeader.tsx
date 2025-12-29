'use client';

export function PassengerHeader({ userName, location }: { userName: string, location: string }) {
  return (
    <div className="p-4 border-b">
      <p className="text-sm text-gray-500">Hola, {userName} 👋</p>
      <p className="font-medium">📍 {location || 'Ubicación no disponible'}</p>
    </div>
  );
}
