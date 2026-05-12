'use client';

import React, { useEffect, useRef } from 'react';
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

    const prevUnreadCount = useRef(unreadCount);

    useEffect(() => {
        if (unreadCount > prevUnreadCount.current) {
            try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (audioCtx.state === 'suspended') audioCtx.resume();
                
                const now = audioCtx.currentTime;
                const playPulse = (startTime: number) => {
                    const osc = audioCtx.createOscillator();
                    const gainNode = audioCtx.createGain();
                    osc.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                    
                    osc.type = 'triangle'; 
                    osc.frequency.setValueAtTime(1100, startTime);
                    osc.frequency.exponentialRampToValueAtTime(1400, startTime + 0.04);
                    
                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(0.4, startTime + 0.01);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.06);
                    
                    osc.start(startTime);
                    osc.stop(startTime + 0.08);
                };

                // Double chirp "Nextel" style for active attention
                playPulse(now);
                playPulse(now + 0.1);
            } catch (e) {
                console.warn("[CHAT] Audio play failed", e);
            }
        }
        prevUnreadCount.current = unreadCount;
    }, [unreadCount]);

    const hasNewMessages = unreadCount > 0;

    return (
        <Button
            onClick={onClick}
            variant="ghost"
            size="icon"
            className={cn(
                "relative h-14 w-14 rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/10 premium-shadow transition-all active:scale-95",
                hasNewMessages && "border-primary/50 bg-primary/10 animate-pulse",
                className
            )}
        >
            <VamoIcon 
                name="message-circle" 
                className={cn(
                    "h-6 w-6",
                    hasNewMessages ? "text-primary" : "text-zinc-100"
                )} 
            />
            {hasNewMessages && (
                <Badge 
                    className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-0 rounded-full font-black text-[11px] bg-primary text-primary-foreground border-zinc-950 border-4 shadow-xl animate-in zoom-in duration-300"
                >
                    {unreadCount}
                </Badge>
            )}
        </Button>
    );
}
