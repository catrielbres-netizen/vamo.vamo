// src/app/driver/earnings/page.tsx
export const dynamic = 'force-dynamic';

import EarningsClientPage from './EarningsClientPage';
// The Server Action is now imported directly by the Client Component.
// We no longer import it here or pass it as a prop.

export default function DriverEarningsPage() {

  return (
    <div className="space-y-6">
      {/* EarningsClientPage will now handle its own action import */}
      <EarningsClientPage />
    </div>
  );
}
