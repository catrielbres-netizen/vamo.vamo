// @/components/admin/charts.tsx
'use client';

import { useRides } from '@/hooks/use-rides';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

export function Charts() {
  const { rides } = useRides();

  const ridesByDay = rides.reduce((acc, ride) => {
    if (ride.startTime) {
      const day = new Date(ride.startTime).toLocaleDateString('es-AR', {
        weekday: 'short',
      });
      acc[day] = (acc[day] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const ridesChartData = Object.entries(ridesByDay).map(([day, count]) => ({
    day,
    rides: count,
  }));

  const incomeByDay = rides.reduce((acc, ride) => {
    if (ride.status === 'finalizado' && ride.fare && ride.endTime) {
      const day = new Date(ride.endTime).toLocaleDateString('es-AR', {
        weekday: 'short',
      });
      acc[day] = (acc[day] || 0) + ride.fare;
    }
    return acc;
  }, {} as Record<string, number>);

  const incomeChartData = Object.entries(incomeByDay).map(([day, total]) => ({
    day,
    income: total,
  }));

  const chartConfig = {
    rides: {
      label: 'Viajes',
      color: 'hsl(var(--primary))',
    },
    income: {
      label: 'Ingresos',
      color: 'hsl(var(--accent))',
    },
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Viajes por Día</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={ridesChartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="rides" fill="var(--color-rides)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ingresos Diarios</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={incomeChartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={(value) =>
                  `$${new Intl.NumberFormat('es-AR').format(value)}`
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      `$${new Intl.NumberFormat('es-AR').format(value as number)}`
                    }
                  />
                }
              />
              <Bar dataKey="income" fill="var(--color-income)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
