'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VamoIcon } from "@/components/VamoIcon";

export default function MunicipalDashboardPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Panel de Control Municipal</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Bienvenido al Portal Municipal</CardTitle>
                    <CardDescription>Desde aquí podrás gestionar y auditar la actividad de los conductores en tu jurisdicción.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                        <VamoIcon name="bot" className="h-12 w-12 mx-auto mb-4" />
                        <p>Las herramientas de gestión municipal se construirán aquí.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
