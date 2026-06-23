import { redirect } from 'next/navigation';

export default function DriverDashboardBridge() {
  redirect('/driver/rides');
}
