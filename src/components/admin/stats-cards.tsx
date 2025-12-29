// @/components/admin/stats-cards.tsx
'use client';
import { Car, CircleDollarSign, Users } from 'lucide-react';
import { useRides } from '@/hooks/use-rides';
import { useUsers } from '@/hooks/use-users';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const StatCard = ({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

export function StatsCards() {
  const { rides } = useRides();
  const { users } = useUsers();

  const totalRides = rides.length;
  const totalIncome = rides
    .filter((r) => r.status === 'finished' && r.fare)
    .reduce((sum, r) => sum + (r.fare || 0), 0);
  const activeDrivers = users.filter((u) => u.role === 'driver').length;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard
        title="Total Rides"
        value={totalRides}
        icon={<Car className="h-4 w-4 text-muted-foreground" />}
      />
      <StatCard
        title="Total Income"
        value={`$${totalIncome.toFixed(2)}`}
        icon={<CircleDollarSign className="h-4 w-4 text-muted-foreground" />}
      />
      <StatCard
        title="Active Drivers"
        value={activeDrivers}
        icon={<Users className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
