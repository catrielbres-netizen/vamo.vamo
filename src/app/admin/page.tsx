'use client';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Car, Users, UserCheck } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';

const StatCard = ({ title, value, icon, loading }: { title: string, value: string | number, icon: React.ReactNode, loading: boolean }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <div className="text-muted-foreground">{icon}</div>
        </CardHeader>
        <CardContent>
            {loading ? (
                <div className="h-8 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
                <div className="text-2xl font-bold">{value}</div>
            )}
        </CardContent>
    </Card>
)

export default function AdminDashboardPage() {
    const firestore = useFirestore();

    const usersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
    const driversQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'driver')) : null, [firestore]);
    const pendingDriversQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'driver'), where('approved', '==', false)) : null, [firestore]);
    const activeRidesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'rides'), where('status', 'in', ['driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused'])) : null, [firestore]);

    const { data: users, isLoading: usersLoading } = useCollection(usersQuery);
    const { data: drivers, isLoading: driversLoading } = useCollection(driversQuery);
    const { data: pendingDrivers, isLoading: pendingDriversLoading } = useCollection(pendingDriversQuery);
    const { data: activeRides, isLoading: activeRidesLoading } = useCollection(activeRidesQuery);

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Panel de Administración</h1>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                    title="Usuarios Totales"
                    value={users?.length ?? 0}
                    loading={usersLoading}
                    icon={<Users className="h-4 w-4" />}
                />
                 <StatCard 
                    title="Conductores Totales"
                    value={drivers?.length ?? 0}
                    loading={driversLoading}
                    icon={<Car className="h-4 w-4" />}
                />
                 <StatCard 
                    title="Viajes Activos"
                    value={activeRides?.length ?? 0}
                    loading={activeRidesLoading}
                    icon={<Activity className="h-4 w-4" />}
                />
                 <StatCard 
                    title="Conductores Pendientes"
                    value={pendingDrivers?.length ?? 0}
                    loading={pendingDriversLoading}
                    icon={<UserCheck className="h-4 w-4" />}
                />
            </div>
        </div>
    );
}
