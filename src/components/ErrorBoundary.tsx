'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { VamoLogo } from '@/components/branding/VamoLogo';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[CRITICAL] Uncaught error:", error, errorInfo);

    // [STABILITY] Self-healing for ChunkLoadErrors (Common during production deployments)
    const isChunkError = error.name === 'ChunkLoadError' || 
                         error.message.includes('ChunkLoadError') || 
                         error.message.includes('Loading chunk');

    if (isChunkError) {
      const hasReloaded = sessionStorage.getItem('chunk_reloaded');
      if (!hasReloaded) {
          sessionStorage.setItem('chunk_reloaded', 'true');
          console.warn("[STABILITY] ChunkLoadError detected. Triggering self-healing reload...");
          window.location.reload();
      }
    }
  }

  private handleRetry = () => {
    // Purge session storage flags if any
    sessionStorage.removeItem('chunk_reloaded');
    this.setState({ hasError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-zinc-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm w-full space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="flex justify-center mb-4">
                <VamoLogo variant="navbar" />
            </div>
            
            <div className="mx-auto w-24 h-24 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center border border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
              <VamoIcon name="alert-triangle" className="h-12 w-12 text-red-500" />
            </div>
            
            <div className="space-y-3">
              <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">Ups, algo falló</h1>
              <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                No pudimos cargar esta sección correctamente. Esto puede deberse a un error de conexión o una actualización del sistema.
              </p>
            </div>

            <div className="pt-4 space-y-3">
              <Button 
                onClick={this.handleRetry}
                className="w-full h-14 bg-white text-black hover:bg-zinc-200 font-black rounded-2xl shadow-xl transition-all active:scale-95 text-lg uppercase tracking-widest"
              >
                REINTENTAR AHORA
              </Button>
              <Button 
                variant="ghost"
                onClick={() => window.location.href = '/'}
                className="w-full h-12 text-zinc-500 font-bold hover:bg-white/5 rounded-xl uppercase tracking-widest text-[10px]"
              >
                Volver al inicio
              </Button>
            </div>

            <div className="pt-8">
              <p className="text-[10px] text-zinc-800 font-black uppercase tracking-[0.3em]">
                VamO PRO Stability System
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
