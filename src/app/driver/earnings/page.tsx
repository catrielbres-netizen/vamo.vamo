// src/app/driver/earnings/page.tsx

export const dynamic = "force-dynamic";

import EarningsClientPage from './EarningsClientPage';
import { createPreferenceAction } from './actions';

export default async function DriverEarningsPage() {

  return (
    <div className="space-y-6">
      <EarningsClientPage createPreferenceAction={createPreferenceAction} />
    </div>
  );
}
