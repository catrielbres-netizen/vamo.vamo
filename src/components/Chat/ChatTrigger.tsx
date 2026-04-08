'use client';

import React from 'react';
import { Ride } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ChatTriggerProps {
    ride: Ride;
    role: 'passenger' | 'driver';
    onClick: () => void;
    className?: string;
}

export function ChatTrigger({ ride, role, onClick, className }: ChatTriggerProps) {
    const unreadCount = role === 'passenger' 
        ? (ride.chatSummary?.unreadCountPassenger || 0) 
        : (ride.chatSummary?.unreadCountDriver || 0);

    const hasNewMessages = unreadCount > 0;

    return (
        <Button
            onClick={onClick}
            variant="ghost"
            size="icon"
            className={cn(
                "relative h-12 w-12 rounded-2xl bg-zinc-900 border border-white/5 premium-shadow",
                hasNewMessages && "border-primary/50 bg-primary/5 animate-pulse",
                className
            )}
        >
            <VamoIcon 
                name="message-circle" 
                className={cn(
                    "h-5 w-5",
                    hasNewMessages ? "text-primary" : "text-zinc-400"
                )} 
            />
            {hasNewMessages && (
                <Badge 
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 rounded-full font-black text-[10px] bg-primary text-primary-foreground border-zinc-950 border-2"
                >
                    {unreadCount}
                </Badge>
            )}
        </Button>
    );
}
