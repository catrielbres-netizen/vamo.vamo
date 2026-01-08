'use client';

import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';

const StatCard = ({ icon, title, value }: { icon: React.ReactNode, title: string, value: string | number }) => (
    <div className="flex items-center gap-4 p-3 bg-secondary/50 rounded-lg">
        <div className="text-primary">{icon}</div>
        <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{value}</p>
        </div>
    </div>
);

const ProfileInfoRow = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number | null | undefined }) => (
    <div className="flex items-start gap-4 text-sm">
        <div className="text-muted-foreground w-6 pt-0.5">{icon}</div>
        <div>
            <p className="text-muted-foreground">{label}</p>
            <p className="font-medium">{value || 'No especificado'}</p>
        </div>
    </div>
);


export default function ProfilePage() {
  const { profile, loading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    if (auth) {
        await signOut(auth)
        router.push('/login')
    }
  }

  if (loading) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }

  if (!profile) {
    return (
        <div className="text-center py-10">
            <VamoIcon name="user" className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No se pudo cargar tu perfil.</p>
        </div>
    );
  }

  const vamoPoints = profile.vamoPoints || 0;
  const pointsToNextBonus = 30;
  const progressToBonus = (vamoPoints / pointsToNextBonus) * 100;
  const ridesCompleted = profile.ridesCompleted ?? 0;
  const averageRating = profile.averageRating?.toFixed(1) ?? 'N/A';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.name}</CardTitle>
          <CardDescription>Pasajero en VamO</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             <ProfileInfoRow icon={<VamoIcon name="mail" />} label="Email" value={profile.email} />
             <ProfileInfoRow icon={<VamoIcon name="phone" />} label="Teléfono" value={profile.phone} />
             <ProfileInfoRow icon={<VamoIcon name="star" />} label="Rating Promedio" value={averageRating} />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><VamoIcon name="award" className="text-primary"/> Puntos VamO</CardTitle>
            <CardDescription>Ganá puntos con cada viaje y canjealos por descuentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
            <div className="text-center">
                <p className="text-4xl font-bold text-primary">{vamoPoints}</p>
                <p className="text-sm text-muted-foreground">puntos acumulados</p>
            </div>
            
            {profile.activeBonus ? (
                 <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-center">
                    <p className="font-semibold text-green-600 dark:text-green-400 flex items-center justify-center gap-2">
                        <VamoIcon name="shield-check" className="w-5 h-5"/> ¡Tenés un bono del 10% activo!
                    </p>
                    <p className="text-xs text-green-500 dark:text-green-500">Se usará en tu próximo viaje.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <Progress value={progressToBonus} />
                    <p className="text-center text-xs text-muted-foreground">
                        Te faltan {Math.max(0, pointsToNextBonus - vamoPoints)} puntos para tu próximo bono de 10% de descuento.
                    </p>
                </div>
            )}
           
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
            <Button variant="outline" size="sm" onClick={handleLogout} className="w-full">
                Cerrar Sesión
            </Button>
        </CardContent>
      </Card>

    </div>
  );
}
