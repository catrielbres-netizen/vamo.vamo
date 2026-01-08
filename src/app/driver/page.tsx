'use client';
export const dynamic = 'force-dynamic';

import { VamoIcon } from '@/components/VamoIcon';

// This page's sole purpose is to be a valid child for the layout.
// The redirection logic is handled in the layout itself.
export default function DriverPage() {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center bg-muted/40">
          <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
          <p className="mt-4 text-muted-foreground">Redirigiendo...</p>
        </div>
      );
}
