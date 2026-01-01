'use client';
import { VamoIcon } from '@/components/icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { Car, User } from 'lucide-react';
import { PassengerHeader } from '@/components/PassengerHeader';
import { useUser } from '@/firebase';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, user } = useUser();

  const activeTabValue = pathname.split('/dashboard/')[1] || 'ride';
  const activeTab = activeTabValue.split('/')[0];

  const handleTabChange = (value: string) => {
    router.push(`/dashboard/${value}`);
  };
  
  const userName = profile?.name || (user?.isAnonymous ? "Invitado" : user?.displayName || "Usuario");

  return (
    <div className="container mx-auto max-w-md p-4">
        <PassengerHeader 
            userName={userName}
            location="Rawson, Chubut" 
        />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full my-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ride" className="gap-2">
            <Car className="w-4 h-4" /> Viaje
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" /> Perfil
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <main>{children}</main>
    </div>
  );
}
