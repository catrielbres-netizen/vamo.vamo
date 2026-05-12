'use client';

import React from 'react';
import { VamoIcon } from '@/components/VamoIcon';

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: string;
  error?: string;
}

export function AuthInput({ label, icon, error, ...props }: AuthInputProps) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest pl-1">
        {label}
      </label>
      <div className="relative group">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-500 transition-colors">
            <VamoIcon name={icon as any} className="w-5 h-5" />
          </div>
        )}
        <input
          {...props}
          className={`
            w-full h-13 bg-zinc-900/50 border rounded-2xl px-4 
            ${icon ? 'pl-12' : 'pl-4'} 
            text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 
            transition-all duration-200
            ${error 
              ? 'border-red-500/50 focus:ring-red-500/20' 
              : 'border-white/5 focus:border-indigo-500/50 focus:ring-indigo-500/20'}
          `}
        />
      </div>
      {error && (
        <p className="text-[10px] font-bold text-red-500 pl-1 animate-in slide-in-from-top-1 duration-200">
          {error}
        </p>
      )}
    </div>
  );
}
