'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function PassengerDashboardSkeleton() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0a0a] animate-in fade-in duration-500">
      {/* Map Skeleton Backdrop */}
      <div className="absolute inset-0 z-0 bg-zinc-900/50">
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      </div>

      {/* Floating Header Skeleton */}
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-[calc(env(safe-area-inset-top,16px)+16px)] pointer-events-none">
        <div className="flex items-center justify-between mb-6">
          <div className="w-32 h-10 rounded-2xl bg-zinc-800/80 animate-pulse" />
          <div className="w-10 h-10 rounded-full bg-zinc-800/80 animate-pulse" />
        </div>

        {/* Input Block Skeleton */}
        <div className="space-y-3 bg-[#1a1a1a]/80 backdrop-blur-xl p-4 rounded-3xl border border-white/5 shadow-2xl">
          <div className="w-full h-14 rounded-2xl bg-zinc-800/50 animate-pulse" />
          <div className="w-full h-14 rounded-2xl bg-zinc-800/50 animate-pulse" />
        </div>
      </div>

      {/* Right Floating Button Skeleton */}
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top,16px)+210px)] z-20 w-12 h-12 rounded-full bg-zinc-800/80 animate-pulse" />

      {/* Bottom Sheet Skeleton (Collapsed) */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-[#1a1a1a] border-t border-white/5 p-6 pb-12 rounded-t-[2.5rem] shadow-2xl">
        <div className="flex flex-col gap-6">
          {/* Header Line */}
          <div className="w-40 h-4 rounded-full bg-zinc-800 animate-pulse" />
          
          {/* Service Selector Placeholder */}
          <div className="w-full h-16 rounded-2xl bg-zinc-800/50 animate-pulse" />

          {/* Action Row */}
          <div className="flex gap-3">
            <div className="w-16 h-14 rounded-2xl bg-zinc-800/50 animate-pulse" />
            <div className="flex-1 h-14 rounded-2xl bg-zinc-800/50 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
