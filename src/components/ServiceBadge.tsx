// @/components/ServiceBadge.tsx
'use client';
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";

const serviceStyles: Record<ServiceType, string> = {
    premium: "bg-yellow-400/20 text-yellow-500 border-yellow-400/30 hover:bg-yellow-400/30",
    express: "bg-violet-400/20 text-violet-500 border-violet-400/30 hover:bg-violet-400/30",
    normal: "bg-indigo-400/20 text-indigo-500 border-indigo-400/30 hover:bg-indigo-400/30",
};

export default function ServiceBadge({ serviceType }: { serviceType: ServiceType }) {
    const style = serviceStyles[serviceType] || serviceStyles.express;
    return (
        <Badge variant="outline" className={cn("capitalize", style)}>
            {serviceType}
        </Badge>
    );
}
