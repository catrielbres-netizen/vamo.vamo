'use client';

export function DriverInfo({ driver }: { driver: any }) {
  if (!driver) return null;

  return (
    <div className="m-4 p-4 rounded-xl border">
      <p className="font-medium">🚘 {driver.name}</p>
      <p className="text-sm text-muted-foreground">
        {driver.car} • {driver.plate}
      </p>
      <p className="text-sm">⭐ {driver.rating}</p>
    </div>
  );
}
