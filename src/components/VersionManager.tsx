'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { VamoLogo } from '@/components/branding/VamoLogo';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * VersionManager
 * This component listens for Service Worker updates.
 * When a new version is installed and waiting, it displays a persistent modal.
 */
export function VersionManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // --- CHUNK ERROR HANDLING ---
    const purgeAndReload = async (source: string) => {
        console.warn(`[VERSION] ${source} detected. Purging cache and reloading...`);
        if (!sessionStorage.getItem('chunk_reloaded')) {
            sessionStorage.setItem('chunk_reloaded', 'true');
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                } catch (e) {}
            }
            window.location.reload();
        }
    };

    const handleGlobalError = (e: ErrorEvent) => {
        const message = e.message || '';
        if (
            message.includes("ChunkLoadError") || 
            message.includes("Loading chunk") ||
            message.includes("Failed to fetch dynamically imported module") ||
            message.includes("Unexpected token '<'") // Common sign of a 404 returning index.html
        ) {
            purgeAndReload("ChunkLoadError (sync)");
        }
    };

    const handlePromiseRejection = (e: PromiseRejectionEvent) => {
        const message = typeof e.reason === 'string' ? e.reason : e.reason?.message || '';
        if (
            message.includes("ChunkLoadError") || 
            message.includes("Loading chunk") ||
            message.includes("Failed to fetch dynamically imported module") ||
            message.includes("Unexpected token '<'")
        ) {
            purgeAndReload("ChunkLoadError (async)");
        }
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);

    // After 5 seconds of successful load, we can reset the chunk_reloaded flag
    const timeoutId = setTimeout(() => {
        sessionStorage.removeItem('chunk_reloaded');
    }, 5000);

    if (!('serviceWorker' in navigator)) return;

    // 1. Explicitly register the service worker
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log("[VERSION] SW registered:", reg.scope);
      
      // Check for updates every 15 minutes
      setInterval(() => {
        reg.update();
        console.log("[VERSION] Checking for SW updates...");
      }, 1000 * 60 * 15);
    }).catch(err => console.error("[VERSION] SW registration failed:", err));

    // 2. Listen for the controllerchange event (new SW took over)
    const handleControllerChange = () => {
      console.log("[VERSION] New controller detected. Reloading...");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // 3. Check for waiting updates on mount
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration && registration.waiting) {
        console.log("[VERSION] Update waiting found on mount.");
        setUpdateAvailable(true);
      }

      if (registration) {
        registration.onupdatefound = () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.onstatechange = () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log("[VERSION] New version installed and ready.");
                setUpdateAvailable(true);
              }
            };
          }
        };
      }
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
      clearTimeout(timeoutId);
    };
  }, []);

  const handleUpdate = async () => {
    setIsReloading(true);
    
    try {
        // Clear all caches manually before reloading
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            console.log("[VERSION] Caches purged.");
        }
    } catch (e) {
        console.error("[VERSION] Cache purge failed:", e);
    }

    // Post message to SW to skip waiting
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        
        // Fallback: If controllerchange doesn't fire, force reload anyway
        setTimeout(() => {
            console.log("[VERSION] Fallback reload triggered.");
            window.location.reload();
        }, 1500);
    } else {
        window.location.reload();
    }
  };


  return (
    <Dialog open={updateAvailable} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[425px] bg-zinc-950 border-white/10 text-white rounded-[2rem] gap-6 p-8"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center text-center space-y-4">
            <VamoLogo variant="navbar" />
            <div className="w-16 h-16 bg-indigo-600/20 rounded-3xl flex items-center justify-center border border-indigo-500/30 animate-bounce">
                <VamoIcon name="rotate-ccw" className="h-8 w-8 text-indigo-400" />
            </div>
            <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tighter uppercase italic">¡VamO se actualizó!</DialogTitle>
                <DialogDescription className="text-zinc-400 text-sm font-medium leading-relaxed">
                    Hay mejoras críticas disponibles para tu versión. Actualizá ahora para seguir usando la app sin interrupciones.
                </DialogDescription>
            </DialogHeader>
        </div>
        
        <DialogFooter className="sm:justify-center">
          <Button 
            disabled={isReloading}
            onClick={handleUpdate}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-95 text-lg uppercase tracking-widest"
          >
            {isReloading ? (
                <VamoIcon name="loader" className="h-5 w-5 animate-spin" />
            ) : (
                "INSTALAR AHORA"
            )}
          </Button>
        </DialogFooter>
        <p className="text-[10px] text-zinc-600 text-center font-bold uppercase tracking-widest">
            Actualización de Sistema VamO
        </p>
      </DialogContent>
    </Dialog>
  );
}
