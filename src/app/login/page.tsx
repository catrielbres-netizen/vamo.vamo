// src/app/login/page.tsx
export const dynamic = "force-dynamic";
import Providers from '../providers';
import LoginPageClient from './LoginPageClient';

// Este es el Componente de Servidor para la página de inicio de sesión.
export default function LoginPage() {
  return (
    <Providers>
      <LoginPageClient />
    </Providers>
  );
}
