import { redirect } from 'next/navigation';

// This page's sole purpose is to redirect to the default dashboard tab.
// The redirect is handled server-side for efficiency.
export default function DashboardPage() {
    redirect('/dashboard/ride');
}
