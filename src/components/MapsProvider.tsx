'use client';
import { APIProvider } from '@vis.gl/react-google-maps';

export function MapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === 'YOUR_REAL_GOOGLE_MAPS_API_KEY') {
    console.error("Google Maps API Key is not configured. Maps features will be disabled.");
    // Return children without the provider if the key is missing or is a placeholder.
    // Components inside will need to handle the lack of the provider gracefully.
    return <>{children}</>;
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'routes']}>
      {children}
    </APIProvider>
  );
}
