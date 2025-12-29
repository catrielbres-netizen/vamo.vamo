'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VamoIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/use-current-user';

const routes = [
  { href: '/', label: 'Passenger', role: 'passenger' },
  { href: '/driver', label: 'Driver', role: 'driver' },
  { href: '/admin', label: 'Admin', role: 'admin' },
];

export function MainNav() {
  const pathname = usePathname();
  const { currentUser } = useCurrentUser();

  return (
    <div className="mr-4 flex">
      <Link href="/" className="mr-6 flex items-center space-x-2">
        <VamoIcon className="h-6 w-6 text-primary" />
        <span className="font-bold">VamO</span>
      </Link>
      <nav className="flex items-center space-x-6 text-sm font-medium">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              'transition-colors hover:text-foreground/80',
              pathname === route.href || currentUser?.role === route.role
                ? 'text-foreground'
                : 'text-foreground/60'
            )}
          >
            {route.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
