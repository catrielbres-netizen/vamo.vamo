// @/components/ServiceBadge.tsx
'use client';
import { Badge } from "@/components/ui/badge";
import { ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";

const serviceStyles: Record<ServiceType, string> = {
    premium: "bg-yellow-400/20 text-yellow-500 border-yellow-400/30 hover:bg-yellow-400/30",
    privado: "bg-green-400/20 text-green-500 border-green-400/30 hover:bg-green-400/30",
    express: "bg-gray-400/20 text-gray-500 border-gray-400/30 hover:bg-gray-400/30",
};

export default function ServiceBadge({ serviceType }: { serviceType: ServiceType }) {
    const style = serviceStyles[serviceType] || serviceStyles.express;
    return (
        <Badge variant="outline" className={cn("capitalize", style)}>
            {serviceType}
        </Badge>
    );
}
