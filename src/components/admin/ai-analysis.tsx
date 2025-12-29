// @/components/admin/ai-analysis.tsx
'use client';
import { Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { analyzeDataAction } from '@/app/actions';
import { useRides } from '@/hooks/use-rides';
import { useUsers } from '@/hooks/use-users';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '../ui/skeleton';

export function AiAnalysis() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { rides } = useRides();
  const { users } = useUsers();

  const handleAnalyze = async () => {
    setIsLoading(true);
    setAnalysis(null);
    try {
      const insights = await analyzeDataAction({
        rideData: JSON.stringify(rides),
        incomeData: JSON.stringify(
          rides
            .filter((r) => r.status === 'finished' && r.fare)
            .map((r) => ({ fare: r.fare, date: r.endTime }))
        ),
        driverPerformanceData: JSON.stringify(
          users.filter((u) => u.role === 'driver')
        ),
      });
      setAnalysis(insights);
    } catch (error) {
      console.error('Analysis failed:', error);
      setAnalysis('An error occurred during analysis.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="text-primary" />
          AI-Powered Data Analysis
        </CardTitle>
        <CardDescription>
          Get instant insights from your data. Click the button to analyze ride
          statistics, income trends, and driver performance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleAnalyze} disabled={isLoading}>
          {isLoading ? 'Analyzing...' : 'Analyze Data with AI'}
        </Button>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
        {analysis && (
          <Card className="bg-secondary/50">
            <CardContent className="prose prose-sm max-w-none p-6 text-foreground dark:prose-invert">
              <pre className="whitespace-pre-wrap font-body text-sm">{analysis}</pre>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
