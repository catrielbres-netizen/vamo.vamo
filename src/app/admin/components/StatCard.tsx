'use client';
import { VamoIcon, VamoIconProps } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';

interface Props {
  title: string
  value: string | number
  icon?: VamoIconProps['name'];
  alert?: boolean;
}

export function StatCard({ title, value, icon, alert }: Props) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col justify-between",
        alert ? "border-destructive/50" : ""
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        {icon && <VamoIcon name={icon} className="h-5 w-5 text-muted-foreground" />}
      </div>
      <p className={cn("text-3xl font-bold mt-2", alert ? "text-destructive" : "")}>{value}</p>
    </div>
  )
}
