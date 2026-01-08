// src/app/login/page.tsx
import LoginPageClient from './LoginPageClient';

export const dynamic = 'force-dynamic';

// Este es el Componente de Servidor para la página de inicio de sesión.
export default function LoginPage() {
  return (
      <LoginPageClient />
  );
}
