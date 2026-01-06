
'use client';
import { VamoIcon } from "./VamoIcon";

export function DriverInfo({ driver }: { driver: any }) {
  if (!driver) return null;

  return (
    <div className="m-4 p-4 rounded-xl border">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
            <VamoIcon name="car" className="w-5 h-5 text-primary" />
            <p className="font-medium">{driver.name}</p>
        </div>
        <div className="text-right">
             <p className="font-semibold text-primary">{driver.arrivalInfo}</p>
             <p className="text-xs text-muted-foreground">en llegar</p>
        </div>
      </div>
    </div>
  );
}
