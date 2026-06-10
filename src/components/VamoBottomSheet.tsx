'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { VamoIcon } from './VamoIcon';

interface VamoBottomSheetProps {
  children: React.ReactNode;
  isOpen?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
  maxHeight?: string; // e.g. "70%"
  minHeight?: string; // e.g. "35%"
}

export function VamoBottomSheet({
  children,
  isOpen = true,
  isExpanded = false,
  onToggleExpand,
  className,
  maxHeight = "72vh",
  minHeight = "38vh"
}: VamoBottomSheetProps) {
  if (!isOpen) return null;

  return (
    <div 
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 flex flex-col pointer-events-none md:bottom-auto md:top-6 md:left-6 md:right-auto md:w-[420px]",
        className
      )}
    >
      <div 
        className={cn(
          "bg-zinc-950/95 backdrop-blur-xl premium-shadow border border-white/10 rounded-t-[2.5rem] md:rounded-[2rem] pointer-events-auto",
          "flex flex-col overflow-hidden sheet-transition",
          "max-h-[85vh] md:max-h-[80vh]"
        )}
        style={{ 
          height: isExpanded ? maxHeight : minHeight,
          transform: `translateY(${isOpen ? '0' : '100%'})`
        }}
      >
        {/* DRAG HANDLE / TOGGLE */}
        <div 
          className="w-full py-4 flex flex-col items-center cursor-pointer shrink-0" 
          onClick={onToggleExpand}
        >
          <div className="w-12 h-1.5 bg-zinc-400/20 dark:bg-white/10 rounded-full mb-1" />
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto px-6 pb-8 prevent-overscroll no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
