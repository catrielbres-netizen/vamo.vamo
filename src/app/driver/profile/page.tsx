
// src/app/driver/profile/page.tsx
'use client';

import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { VamoIcon } from '@/components/VamoIcon';
import { UserProfile } from '@/lib/types';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const verificationStatusBadge: Record<UserProfile['vehicleVerificationStatus'] & string, { text: string, variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    unverified: { text: 'No Verificado', variant: 'destructive' },
    pending_review: { text: 'Pendiente de Revisión', variant: 'secondary' },
    approved: { text: 'Aprobado', variant: 'default' },
    rejected: { text: 'Rechazado', variant: 'destructive' },
}

function formatCurrency(value: number) {
    if (typeof value !== 'number') return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}


const ProfileInfoRow = ({ icon, label, value, valueClassName }: { icon: React.ReactNode, label: string, value: string | number | null | undefined, valueClassName?: string }) => (
    <div className="flex items-center gap-4 text-sm">
        <div className="text-muted-foreground w-6">{icon}</div>
        <div className="flex-1">
            <p className="text-muted-foreground">{label}</p>
            <p className={cn("font-medium", valueClassName)}>{value || 'No especificado'}</p>
        </div>
    </div>
);


export default function DriverProfilePage() {
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
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                </CardContent>
            </Card>
        </div>
    );
  }

  if (!profile) {
    return (
      <p className="text-center text-destructive">No se pudo cargar tu perfil.</p>
    );
  }
  
  const verificationInfo = verificationStatusBadge[profile.vehicleVerificationStatus || 'unverified'];
  const averageRating = profile.averageRating?.toFixed(1) ?? 'N/A';
  const platformCredit = profile.platformCredit ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{profile.name} {profile.lastName}</CardTitle>
              <CardDescription>Conductor en VamO</CardDescription>
            </div>
            <Badge variant={verificationInfo.variant}>{verificationInfo.text}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <ProfileInfoRow icon={<VamoIcon name="mail" />} label="Email" value={profile.email} />
            <ProfileInfoRow icon={<VamoIcon name="phone" />} label="Teléfono" value={profile.phone} />
            <ProfileInfoRow icon={<VamoIcon name="car" />} label="Año del Vehículo" value={profile.carModelYear} />
            <ProfileInfoRow icon={<VamoIcon name="star" />} label="Rating Promedio" value={averageRating} />
            <ProfileInfoRow 
              icon={<VamoIcon name="wallet" />} 
              label="Crédito de Plataforma" 
              value={formatCurrency(platformCredit)} 
              valueClassName={cn("text-lg font-bold", platformCredit > 0 ? "text-green-500" : "text-destructive")}
            />
        </CardContent>
        <CardContent>
             <Button variant="outline" size="sm" onClick={handleLogout} className="w-full">
                Cerrar Sesión
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}
