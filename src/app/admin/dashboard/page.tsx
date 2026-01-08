'use client';

import { StatCard } from '@/app/admin/components/StatCard'
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, query, where } from 'firebase/firestore'
import { UserProfile, Ride, DriverSummary } from '@/lib/types'
import { useMemo } from 'react'
import { getWeek, getYear, startOfWeek } from 'date-fns'
import { VamoIcon } from '@/components/VamoIcon'

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
    return users?.filter(u => u.role === 'driver' && u.driverStatus === 'online' && u.currentLocation) ?? []
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

  const alertThresholds = {
    activeRides: 10,
    driversOnline: 2,
    weeklyRevenue: 10000,
  };


  return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard de Lanzamiento</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Comisión Total (Histórico)" value={isLoading ? '...' : formatCurrency(totalCommissionEarned)} icon="dollar-sign" />
          <StatCard title="Facturación Bruta (Semana)" value={isLoading ? '...' : formatCurrency(currentWeekGross)} icon="calendar-clock" alert={!isLoading && currentWeekGross < alertThresholds.weeklyRevenue} />
          <StatCard title="Comisión a Recibir (Semana)" value={isLoading ? '...' : formatCurrency(currentWeekCommission)} icon="wallet" />
          <StatCard title="Viajes activos" value={isLoading ? '...' : activeRides} icon="search" alert={!isLoading && activeRides > alertThresholds.activeRides} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Usuarios registrados" value={isLoading ? '...' : totalUsers} icon="users" />
          <StatCard title="Viajes totales" value={isLoading ? '...' : totalRides} icon="car" />
          <StatCard title="Conductores en línea" value={isLoading ? '...' : onlineDrivers.length} icon="map" alert={!isLoading && onlineDrivers.length < alertThresholds.driversOnline} />
        </div>
      </div>
  )
}
