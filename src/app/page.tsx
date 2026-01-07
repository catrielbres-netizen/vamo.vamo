// src/app/page.tsx
export const dynamic = "force-dynamic";

import Providers from './providers';
import HomePageClient from './HomePageClient';

// This is the Server Component entry point for the page.
export default function Home() {
  return (
    <Providers>
      <HomePageClient />
    </Providers>
  );
}
