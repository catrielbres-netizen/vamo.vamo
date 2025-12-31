// src/app/admin/page.tsx
'use client';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users, Car, AlertTriangle, Route, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Metrics {
  totalUsers: number;
  totalDrivers: number;
  pendingDrivers: number;
  totalRides: number;
  activeRides: number;
}

const MetricCard = ({ title, value, icon, isLoading }: { title: string; value: number; icon: React.ReactNode; isLoading: boolean }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div className="text-2xl font-bold">{value}</div>
      )}
    </CardContent>
  </Card>
);

export default function AdminDashboardPage() {
  const firestore = useFirestore();
  const [metrics, setMetrics] = useState<Metrics>({
    totalUsers: 0,
    totalDrivers: 0,
    pendingDrivers: 0,
    totalRides: 0,
    activeRides: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;
    setIsLoading(true);

    const queries = {
      users: collection(firestore, 'users'),
      rides: collection(firestore, 'rides'),
    };
    
    const unsubscribes = [
      onSnapshot(queries.users, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data());
        const drivers = users.filter(u => u.role === 'driver');
        setMetrics(prev => ({
          ...prev,
          totalUsers: snapshot.size,
          totalDrivers: drivers.length,
          pendingDrivers: drivers.filter(d => d.approved === false).length,
        }));
        setIsLoading(false);
      }),
      onSnapshot(queries.rides, (snapshot) => {
        const activeStatuses = ['driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused'];
        const activeRides = snapshot.docs.filter(doc => activeStatuses.includes(doc.data().status)).length;
        setMetrics(prev => ({
          ...prev,
          totalRides: snapshot.size,
          activeRides: activeRides,
        }));
        setIsLoading(false);
      }),
    ];

    return () => unsubscribes.forEach(unsub => unsub());

  }, [firestore]);
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard title="Total de Usuarios" value={metrics.totalUsers} icon={<Users className="h-4 w-4 text-muted-foreground" />} isLoading={isLoading} />
        <MetricCard title="Total de Conductores" value={metrics.totalDrivers} icon={<Car className="h-4 w-4 text-muted-foreground" />} isLoading={isLoading} />
        <MetricCard title="Conductores Pendientes" value={metrics.pendingDrivers} icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} isLoading={isLoading} />
        <MetricCard title="Viajes Totales" value={metrics.totalRides} icon={<Route className="h-4 w-4 text-muted-foreground" />} isLoading={isLoading} />
        <MetricCard title="Viajes Activos" value={metrics.activeRides} icon={<Activity className="h-4 w-4 text-muted-foreground" />} isLoading={isLoading} />
      </div>
       <Card>
        <CardHeader>
          <CardTitle>Actividad Reciente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Próximamente: Logs de auditoría y viajes recientes aquí.</p>
        </CardContent>
      </Card>
    </div>
  );
}
