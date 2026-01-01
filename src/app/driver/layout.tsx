
'use client';
import { VamoIcon } from '@/components/icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { Car, Wallet, Percent, User } from 'lucide-react';
import { useUser } from '@/firebase';
import { useEffect } from 'react';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading } = useUser();

  useEffect(() => {
    if (loading) return; // Don't do anything while loading

    if (!profile) {
      // If there's no profile, something is wrong, maybe send to login
      router.replace('/login');
      return;
    }
    
    // If the profile is not completed and they are not on the completion pages, redirect them.
    if (!profile.profileCompleted && !pathname.startsWith('/driver/complete-profile')) {
      router.replace('/driver/complete-profile');
    }
    
  }, [profile, loading, pathname, router]);

  if (loading || (!profile?.profileCompleted && !pathname.startsWith('/driver/complete-profile'))) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando panel de conductor...</p>
      </div>
    );
  }

  const activeTabValue = pathname.split('/driver/')[1] || 'rides';
  const activeTab = activeTabValue.split('/')[0];

  const handleTabChange = (value: string) => {
    router.push(`/driver/${value}`);
  };

  return (
    <div className="container mx-auto max-w-md p-4">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <VamoIcon className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Panel Conductor</h1>
        </div>
        <span className="text-sm font-medium text-muted-foreground">{profile.name}</span>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full mb-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rides" className="gap-2">
            <Car className="w-4 h-4" /> Viajes
          </TabsTrigger>
          <TabsTrigger value="earnings" className="gap-2">
            <Wallet className="w-4 h-4" /> Ganancias
          </TabsTrigger>
          <TabsTrigger value="discounts" className="gap-2">
            <Percent className="w-4 h-4" /> Bonos
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <main>{children}</main>
    </div>
  );
}
