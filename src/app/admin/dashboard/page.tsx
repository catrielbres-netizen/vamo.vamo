'use client'

import { StatCard } from '../components/StatCard'
import { useCollection, useMemoFirebase } from '@/firebase'
import { collection, query, where } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Users, Car, Search, Map as MapIcon } from 'lucide-react'
import DriversMap from '../components/DriversMap'
import { UserProfile, Ride } from '@/lib/types'
import { WithId } from '@/firebase/firestore/use-collection'
import { useMemo } from 'react'

export default function AdminDashboard() {
  const db = useFirestore()

  const usersQuery = useMemoFirebase(() => db ? collection(db, 'users') : null, [db]);
  const ridesQuery = useMemoFirebase(() => db ? query(collection(db, 'rides'), where('status', 'in', ['in_progress', 'driver_arriving'])) : null, [db]);
  const allRidesQuery = useMemoFirebase(() => db ? collection(db, 'rides') : null, [db]);


  const { data: users, isLoading: usersLoading } = useCollection<UserProfile>(usersQuery)
  const { data: activeRidesData, isLoading: activeRidesLoading } = useCollection<Ride>(ridesQuery)
  const { data: allRides, isLoading: allRidesLoading } = useCollection<Ride>(allRidesQuery);


  const onlineDrivers = useMemo(() => {
    // We add a mock location because we are not tracking it yet
    return users?.filter(u => u.role === 'driver' && u.driverStatus === 'online').map((driver, index) => ({
      ...driver,
      currentLocation: driver.currentLocation ?? {
        lat: -43.3005 + (Math.random() - 0.5) * 0.1, // Simulate around Rawson
        lng: -65.1023 + (Math.random() - 0.5) * 0.1,
      }
    })) ?? []
  }, [users])

  const totalUsers = users?.length ?? 0
  const totalRides = allRides?.length ?? 0;
  const activeRides = activeRidesData?.length ?? 0

  const isLoading = usersLoading || activeRidesLoading || allRidesLoading;


  return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Usuarios registrados" value={isLoading ? '...' : totalUsers} icon={<Users className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Viajes totales" value={isLoading ? '...' : totalRides} icon={<Car className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Viajes activos" value={isLoading ? '...' : activeRides} icon={<Search className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Conductores en línea" value={isLoading ? '...' : onlineDrivers.length} icon={<MapIcon className="h-5 w-5 text-muted-foreground"/>} />
        </div>

        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <DriversMap drivers={onlineDrivers as WithId<UserProfile>[]} />
        </div>
      </div>
  )
}
