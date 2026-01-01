
'use client';

export function DriverInfo({ driver }: { driver: any }) {
  if (!driver) return null;

  return (
    <div className="m-4 p-4 rounded-xl border">
      <div className="flex justify-between items-center">
        <div>
            <p className="font-medium">🚘 {driver.name}</p>
            <p className="text-sm text-muted-foreground">
                {driver.car} • {driver.plate}
            </p>
        </div>
        <div className="text-right">
             <p className="font-semibold text-primary">{driver.arrivalInfo}</p>
             <p className="text-xs text-muted-foreground">en llegar</p>
        </div>
      </div>
    </div>
  );
}
