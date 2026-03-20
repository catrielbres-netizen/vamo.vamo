'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VamoIcon } from '@/components/VamoIcon';

export default function AdminDashboardPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Métricas Clave</CardTitle>
                    <CardDescription>Resumen operativo de la plataforma.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                        <VamoIcon name="bot" className="h-12 w-12 mx-auto mb-4" />
                        <p>Las estadísticas se implementarán aquí en la siguiente fase.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
