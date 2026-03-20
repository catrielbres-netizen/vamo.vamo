'use client';

import Link from 'next/link';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useCollection, useUser, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type DriverRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  approved?: boolean;
  isSuspended?: boolean;
  serviceTier?: 'express' | 'premium';
  servicesOffered?: {
    express?: boolean;
    premium?: boolean;
  };
  currentBalance?: number;
  photoURL?: string;
};

function formatMoney(value?: number) {
  if (typeof value !== 'number') return '$0';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function serviceLabel(driver: DriverRow) {
  const tier = driver.serviceTier || 'sin definir';
  const express = driver.servicesOffered?.express === true;
  const premium = driver.servicesOffered?.premium === true;

  if (tier === 'express') return 'Express';
  if (tier === 'premium' && express) return 'Premium + Express';
  if (tier === 'premium') return 'Premium';
  if (premium && express) return 'Premium + Express';
  if (premium) return 'Premium';
  if (express) return 'Express';
  return 'Sin configurar';
}

export default function AdminDriversPage() {
  const firestore = useFirestore();
  const { user, profile, loading: authLoading } = useUser();

  const driversQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !user || profile?.role !== 'admin') return null;

    return query(
      collection(firestore, 'users'),
      where('role', '==', 'driver')
    );
  }, [firestore, user, profile, authLoading]);

  const { data: drivers, isLoading, error } = useCollection<DriverRow>(driversQuery);

  if (authLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conductores</h1>
        <p className="text-sm text-muted-foreground">
          Gestión base de conductores, aprobación y tipo de servicio.
        </p>
      </div>

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Error cargando conductores</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-600">
            {error.message}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!isLoading && !error && (
        <div className="rounded-xl border overflow-hidden bg-background">
          <div className="grid grid-cols-7 gap-3 px-4 py-3 border-b text-xs font-semibold text-muted-foreground">
            <div className="col-span-2">Conductor</div>
            <div>Estado</div>
            <div>Aprobación</div>
            <div>Servicio</div>
            <div>Saldo</div>
            <div className="text-right">Acción</div>
          </div>

          {drivers?.length ? (
            drivers.map((driver) => (
              <div
                key={driver.id}
                className="grid grid-cols-7 gap-3 px-4 py-3 border-b last:border-b-0 items-center text-sm"
              >
                <div className="col-span-2 flex items-center gap-3">
                   <Avatar className="h-9 w-9">
                    <AvatarImage src={driver.photoURL || undefined} alt={driver.name || ''} />
                    <AvatarFallback>{driver.name ? driver.name.charAt(0).toUpperCase() : 'S'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{driver.name || 'Sin nombre'}</div>
                    <div className="text-xs text-muted-foreground">
                      {driver.phone || driver.email || 'Sin contacto'}
                    </div>
                  </div>
                </div>

                <div>
                  {driver.isSuspended ? (
                    <span className="text-red-600 font-medium">Suspendido</span>
                  ) : (
                    <span className="text-green-600 font-medium">Activo</span>
                  )}
                </div>

                <div>
                  {driver.approved ? (
                    <span className="text-green-600 font-medium">Aprobado</span>
                  ) : (
                    <span className="text-amber-600 font-medium">Pendiente</span>
                  )}
                </div>

                <div>{serviceLabel(driver)}</div>

                <div>{formatMoney(driver.currentBalance)}</div>

                <div className="text-right">
                  <Link href={`/admin/driver-detail?id=${driver.id}`} prefetch={false}>
                    <Button size="sm" variant="outline">
                      Ver detalle
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              No hay conductores para mostrar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
