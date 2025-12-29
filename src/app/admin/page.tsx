'use client';

import { AiAnalysis } from '@/components/admin/ai-analysis';
import { Charts } from '@/components/admin/charts';
import { StatsCards } from '@/components/admin/stats-cards';
import { useCurrentUser } from '@/hooks/use-current-user';

export default function AdminPage() {
  const { currentUser } = useCurrentUser();

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="container py-10 text-center">
        <p>You must be an admin to view this page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
        <StatsCards />
        <Charts />
        <AiAnalysis />
      </div>
    </div>
  );
}
