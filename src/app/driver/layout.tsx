// src/app/driver/layout.tsx
'use client';
import { VamoIcon } from '@/components/icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { Car, Wallet, Percent } from 'lucide-react';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine the active tab from the URL
  const activeTabValue = pathname.split('/driver/')[1] || 'rides';
  const activeTab = activeTabValue.includes('earnings') ? 'earnings' : activeTabValue.includes('discounts') ? 'discounts' : 'rides';


  const handleTabChange = (value: string) => {
    router.push(`/driver/${value}`);
  };

  return (
    <div className="container mx-auto max-w-md p-4">
      <div className="flex justify-center items-center mb-6">
        <VamoIcon className="h-8 w-8 text-primary mr-2" />
        <h1 className="text-3xl font-bold text-center">Panel Conductor</h1>
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
            <Percent className="w-4 h-4" /> Descuentos
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <main>{children}</main>
    </div>
  );
}
