'use client';

import React from 'react';

interface NotificationGateProps {
  children: React.ReactNode;
}

/**
 * [VamO PUSH CLEANUP]
 * NotificationGate ha sido neutralizado. 
 * Ahora es un componente passthrough que siempre renderiza sus hijos inmediatamente.
 */
export function NotificationGate({ children }: NotificationGateProps) {
  return (
    <div className="relative min-h-screen flex flex-col w-full">
      <div className="flex-1 flex flex-col w-full overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
