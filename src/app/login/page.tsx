// src/app/login/page.tsx
export const dynamic = "force-dynamic";

import Providers from '../providers';
import LoginPageClient from './LoginPageClient';

// This is the Server Component entry point for the login page.
export default function LoginPage() {
  return (
    <Providers>
      <LoginPageClient />
    </Providers>
  );
}
