'use client';

interface Props {
  title: string
  value: string | number
  icon?: React.ReactNode
}

export function StatCard({ title, value, icon }: Props) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        {icon}
      </div>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  )
}
