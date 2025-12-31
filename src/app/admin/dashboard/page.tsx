'use client'

import { StatCard } from '../components/StatCard'
import { useCollection, useMemoFirebase } from '@/firebase'
import { collection } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Users, Car, Search } from 'lucide-react'

export default function AdminDashboard() {
  const db = useFirestore()

  const usersQuery = useMemoFirebase(() => db ? collection(db, 'users') : null, [db]);
  const ridesQuery = useMemoFirebase(() => db ? collection(db, 'rides') : null, [db]);

  const { data: users, isLoading: usersLoading } = useCollection(usersQuery)
  const { data: rides, isLoading: ridesLoading } = useCollection(ridesQuery)

  const totalUsers = users?.length ?? 0
  const totalRides = rides?.length ?? 0
  const activeRides = rides?.filter(r => r.status === 'searching_driver' || r.status === 'in_progress').length ?? 0

  return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Usuarios registrados" value={usersLoading ? '...' : totalUsers} icon={<Users className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Viajes totales" value={ridesLoading ? '...' : totalRides} icon={<Car className="h-5 w-5 text-muted-foreground"/>} />
          <StatCard title="Viajes activos" value={ridesLoading ? '...' : activeRides} icon={<Search className="h-5 w-5 text-muted-foreground"/>} />
        </div>
      </div>
  )
}
