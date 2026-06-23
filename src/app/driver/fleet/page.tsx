import { Metadata } from 'next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';

export const metadata: Metadata = {
  title: 'Mi Taxi / Mis Choferes | VamO Conductor',
  description: 'Gestión de choferes para dueños de taxi',
};

export default function FleetPage() {
  return (
    <div className="p-4 flex flex-col gap-4">
        <h1 className="text-2xl font-black uppercase tracking-tighter">Mi Taxi</h1>
        <Alert className="bg-primary/5 border-primary/20 text-primary">
            <VamoIcon name="info" className="h-4 w-4" />
            <AlertTitle>Próximamente</AlertTitle>
            <AlertDescription>
                Esta función estará disponible en una próxima etapa.
            </AlertDescription>
        </Alert>
    </div>
  );
}
