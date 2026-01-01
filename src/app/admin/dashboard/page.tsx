
'use client'

import { StatCard } from '../components/StatCard'
import { useCollection, useMemoFirebase } from '@/firebase'
import { collection, query, where } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Users, Car, Search, Map as MapIcon, DollarSign, Wallet, CalendarClock } from 'lucide-react'
import DriversMap from '../components/DriversMap'
import { UserProfile, Ride, DriverSummary } from '@/lib/types'
import { WithId } from '@/firebase/firestore/use-collection'
import { useMemo } from 'react'
import { getWeek, getYear, startOfWeek } from 'date-fns'


const formatCurrency = (value: number) => {
  if (typeof value !== 'number') return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};


export default function AdminDashboard() {
  const db = useFirestore()

  const usersQuery = useMemoFirebase(() => db ? collection(db, 'users') : null, [db]);
  const activeRidesQuery = useMemoFirebase(() => db ? query(collection(db, 'rides'), where('status', 'in', ['in_progress', 'driver_arriving'])) : null, [db]);
  const allRidesQuery = useMemoFirebase(() => db ? collection(db, 'rides') : null, [db]);
  const summariesQuery = useMemoFirebase(() => db ? collection(db, 'driver_summaries') : null, [db]);


  const { data: users, isLoading: usersLoading } = useCollection<UserProfile>(usersQuery)
  const { data: activeRidesData, isLoading: activeRidesLoading } = useCollection<Ride>(activeRidesQuery)
  const { data: allRides, isLoading: allRidesLoading } = useCollection<Ride>(allRidesQuery);
  const { data: summaries, isLoading: summariesLoading } = useCollection<DriverSummary>(summariesQuery);


  const onlineDrivers = useMemo(() => {
    return users?.filter(u => u.role === 'driver' && u.driverStatus === 'online').map((driver, index) => ({
      ...driver,
      currentLocation: driver.currentLocation ?? {
        lat: -43.3005 + (Math.random() - 0.5) * 0.1, // Simulate around Rawson
        lng: -65.1023 + (Math.random() - 0.5) * 0.1,
      }
    })) ?? []
  }, [users])

  const {
      totalCommissionEarned,
      currentWeekGross,
      currentWeekCommission
  } = useMemo(() => {
      if (!summaries) {
          return { totalCommissionEarned: 0, currentWeekGross: 0, currentWeekCommission: 0 };
      }

      const today = new Date();
      const weekStartsOn = 1; // Monday
      const firstDayOfWeek = startOfWeek(today, { weekStartsOn });
      const currentWeekId = `${getYear(firstDayOfWeek)}-W${getWeek(firstDayOfWeek, { weekStartsOn })}`;

      const totalCommission = summaries
          .filter(s => s.status === 'paid')
          .reduce((acc, s) => acc + s.commissionOwed, 0);

      const weeklyGross = summaries
          .filter(s => s.weekId === currentWeekId)
          .reduce((acc, s) => acc + s.totalEarnings, 0);

      const weeklyCommission = summaries
          .filter(s => s.weekId === currentWeekId && s.status === 'pending')
          .reduce((acc, s) => acc + s.commissionOwed, 0);

      return {
          totalCommissionEarned: totalCommission,
          currentWeekGross: weeklyGross,
          currentWeekCommission: weeklyCommission
      };
  }, [summaries]);


  const totalUsers = users?.length ?? 0
  const totalRides = allRides?.length ?? 0;
  const activeRides = activeRidesData?.length ?? 0

  const isLoading = usersLoading || activeRidesLoading || allRidesLoading || summariesLoading;


  return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Comisión Total (Histórico)" value={isLoading ? '...' : formatCurrency(totalCommissionEarned)} icon={<DollarSign className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Facturación Bruta (Semana)" value={isLoading ? '...' : formatCurrency(currentWeekGross)} icon={<CalendarClock className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Comisión a Recibir (Semana)" value={isLoading ? '...' : formatCurrency(currentWeekCommission)} icon={<Wallet className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Viajes activos" value={isLoading ? '...' : activeRides} icon={<Search className="h-5 w-5 text-muted-foreground"/>} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Usuarios registrados" value={isLoading ? '...' : totalUsers} icon={<Users className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Viajes totales" value={isLoading ? '...' : totalRides} icon={<Car className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Conductores en línea" value={isLoading ? '...' : onlineDrivers.length} icon={<MapIcon className="h-5 w-5 text-muted-foreground"/>} />
        </div>

        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <DriversMap drivers={onlineDrivers as WithId<UserProfile>[]} />
        </div>
      </div>
  )
}
