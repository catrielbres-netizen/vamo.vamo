// src/app/page.tsx
export const dynamic = "force-dynamic";
import HomePageClient from './HomePageClient';

// Este es el Componente de Servidor para la página de inicio.
// Su única responsabilidad es renderizar el componente de cliente.
export default function Home() {
  return <HomePageClient />;
}
