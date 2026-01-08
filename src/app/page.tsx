// src/app/page.tsx
export const dynamic = "force-dynamic";
import HomePageClient from './HomePageClient';

// Este es el Componente de Servidor para la página de inicio.
export default function Home() {
  return (
      <HomePageClient />
  );
}
