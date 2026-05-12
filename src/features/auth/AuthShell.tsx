'use client';

import React from 'react';
import { VamoLogo } from '@/components/branding/VamoLogo';

interface AuthShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
}

export function AuthShell({ children, title, subtitle, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4 md:p-6 selection:bg-indigo-500/30">
      <div className="w-full max-w-[420px] space-y-8 animate-in fade-in zoom-in duration-500">
        
        {/* Branding Header */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-[140px] transition-transform hover:scale-105 duration-300">
            <VamoLogo variant="auth" priority />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">{title}</h1>
            {subtitle && (
              <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
          {children}
        </div>

        {/* Global Footer */}
        {footer && (
          <div className="text-center pt-4">
            {footer}
          </div>
        )}

        <div className="text-center">
            <p className="text-[10px] text-zinc-700 font-bold uppercase tracking-widest opacity-50">
                VamO PRO Security Infrastructure
            </p>
        </div>
      </div>
    </div>
  );
}
