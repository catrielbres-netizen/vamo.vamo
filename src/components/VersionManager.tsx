'use client';

/**
 * VersionManager — Robusto y anti-loop
 * ─────────────────────────────────────────────────────────────────────────────
 * CAUSA DEL BUG ORIGINAL:
 *  1. El SW tiene `self.skipWaiting()` en el install event → se auto-activa
 *     antes de que el VersionManager detecte el estado "waiting".
 *     Resultado: `reg.waiting` es null cuando el botón se presiona → nada ocurre.
 *  2. El modal usa `onOpenChange={() => {}}` → el usuario NO puede cerrarlo.
 *  3. No hay botón de escape / "Ahora no".
 *  4. El `controllerchange` event lanza `window.location.reload()` pero si
 *     ya no hay `waiting`, ese evento puede no dispararse → loop bloqueado.
 *  5. La condición `setUpdateAvailable(true)` en `onupdatefound` se dispara
 *     cuando el nuevo SW llega a estado "installed" — pero con skipWaiting en
 *     install, el SW ya se activó y `controller` ya cambió, provocando que
 *     el reload se ejecute antes de que el usuario vea el modal.
 *
 * CORRECCIONES:
 *  - Botón "Ahora no" para que el usuario pueda descartar.
 *  - handleUpdate con triple fallback:
 *      1. reg.waiting.postMessage(SKIP_WAITING) + esperar controllerchange
 *      2. Si no hay waiting: limpiar caches + reload directo
 *      3. Timeout de seguridad de 2s si controllerchange no dispara
 *  - Anti-loop con sessionStorage: si ya recargamos por esta sesión, no
 *    volvemos a mostrar el modal.
 *  - El modal es descartable (salvo ChunkLoadError que sí es crítico).
 *  - `sessionStorage.chunk_reloaded` se limpia a los 5s para no bloquear
 *    la sesión después de una recarga exitosa.
 *
 * NO TOCAR: wallet / refund / settlement / tarifa dinámica / matching / IA.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Clave de sesión para anti-loop
const SESSION_KEY_RELOADED = 'vamo_sw_reloaded_v5';
// Clave de sesión para el error de chunk
const SESSION_KEY_CHUNK = 'vamo_chunk_reloaded';

export function VersionManager() {
  const { profile } = useUser();
  const { toast } = useToast();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [deferredUpdate, setDeferredUpdate] = useState(false);
  // Ref al SW en espera para no depender del closure
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  const hasActiveRide = !!profile?.activeRideId;
  const hasActiveRideRef = useRef(hasActiveRide);

  useEffect(() => {
    hasActiveRideRef.current = hasActiveRide;
  }, [hasActiveRide]);

  useEffect(() => {
    if (!hasActiveRide && deferredUpdate) {
      console.log('[VERSION] Active ride ended. Displaying deferred update modal.');
      setUpdateAvailable(true);
      setDeferredUpdate(false);
    }
  }, [hasActiveRide, deferredUpdate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ── Chunk Load Error Handler ─────────────────────────────────────────────
    // Se dispara cuando Next.js no puede cargar un chunk del build anterior.
    const purgeAndReload = async (source: string) => {
      console.warn(`[VERSION] ${source} — purging cache and reloading.`);
      // Anti-loop: si ya recargamos una vez en esta sesión, no volver a hacerlo.
      if (sessionStorage.getItem(SESSION_KEY_CHUNK)) {
        console.warn('[VERSION] Already reloaded for chunk error. Skipping.');
        return;
      }
      sessionStorage.setItem(SESSION_KEY_CHUNK, 'true');
      if ('caches' in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        } catch (_) {}
      }
      window.location.reload();
    };

    const handleGlobalError = (e: ErrorEvent) => {
      const msg = e.message || '';
      if (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes("Unexpected token '<'")
      ) {
        purgeAndReload('ChunkLoadError (sync)');
      }
    };

    const handlePromiseRejection = (e: PromiseRejectionEvent) => {
      const msg = typeof e.reason === 'string' ? e.reason : e.reason?.message || '';
      if (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes("Unexpected token '<'")
      ) {
        purgeAndReload('ChunkLoadError (async)');
      }
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);

    // Limpiar el flag de chunk a los 5s: recarga exitosa
    const chunkFlagTimeout = setTimeout(() => {
      sessionStorage.removeItem(SESSION_KEY_CHUNK);
    }, 5000);

    // ── Service Worker Update Detection ──────────────────────────────────────
    if (!('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('error', handleGlobalError);
        window.removeEventListener('unhandledrejection', handlePromiseRejection);
        clearTimeout(chunkFlagTimeout);
      };
    }

    // Anti-loop: si ya actualizamos esta sesión, no mostrar el modal de nuevo.
    const alreadyReloaded = sessionStorage.getItem(SESSION_KEY_RELOADED);

    const showUpdateModal = (sw: ServiceWorker) => {
      if (alreadyReloaded) {
        console.log('[VERSION] Already reloaded this session. Skipping update modal.');
        return;
      }
      waitingWorkerRef.current = sw;
      if (hasActiveRideRef.current) {
        console.log('[VERSION] Active ride in progress. Postponing update notice.');
        setDeferredUpdate(true);
        toast({
          title: "Actualización disponible",
          description: "Se aplicará automáticamente al finalizar tu viaje."
        });
      } else {
        setUpdateAvailable(true);
      }
    };

    // Registrar SW
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[VERSION] SW registered:', reg.scope);

      // Revisar en mount si ya hay un SW esperando
      if (reg.waiting) {
        console.log('[VERSION] SW waiting found on mount.');
        showUpdateModal(reg.waiting);
      }

      // Escuchar actualizaciones futuras
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // "installed" + hay un controller activo = nuevo SW en estado waiting
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[VERSION] New SW installed and waiting.');
            showUpdateModal(newWorker);
          }
        });
      });

      // Polling cada 15 min para detectar nuevas versiones en sesiones largas
      setInterval(() => {
        reg.update();
      }, 1000 * 60 * 15);
    }).catch((err) => {
      console.error('[VERSION] SW registration failed:', err);
    });

    // controllerchange: el nuevo SW tomó el control → recargar
    // Usamos refreshing flag para evitar múltiples recargas
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[VERSION] controllerchange — reloading.');
      sessionStorage.setItem(SESSION_KEY_RELOADED, 'true');
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
      clearTimeout(chunkFlagTimeout);
    };
  }, []);

  // ── Botón INSTALAR AHORA ─────────────────────────────────────────────────
  const handleUpdate = async () => {
    setIsReloading(true);
    console.log('[VERSION] handleUpdate triggered.');

    // 1. Limpiar todas las caches del browser (garantiza chunks frescos)
    if ('caches' in window) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
        console.log('[VERSION] All caches purged.');
      } catch (e) {
        console.warn('[VERSION] Cache purge failed:', e);
      }
    }

    // 2. Si hay SW waiting → enviar SKIP_WAITING y dejar que controllerchange
    //    dispare el reload.
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    const waiting = waitingWorkerRef.current || reg?.waiting;

    if (waiting) {
      console.log('[VERSION] Sending SKIP_WAITING to waiting SW.');
      waiting.postMessage({ type: 'SKIP_WAITING' });

      // Timeout de seguridad: si controllerchange no dispara en 2s, forzar reload
      setTimeout(() => {
        console.log('[VERSION] Safety timeout — forcing reload.');
        sessionStorage.setItem(SESSION_KEY_RELOADED, 'true');
        window.location.reload();
      }, 2000);
    } else {
      // 3. Fallback: no hay SW waiting → limpiar y recargar directo
      console.log('[VERSION] No waiting SW found. Direct reload.');
      // Unregister todos los SWs para asegurar estado limpio
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        await Promise.all(regs.map((r) => r.unregister()));
      }
      sessionStorage.setItem(SESSION_KEY_RELOADED, 'true');
      window.location.reload();
    }
  };

  // ── Botón AHORA NO ────────────────────────────────────────────────────────
  const handleDismiss = () => {
    console.log('[VERSION] User dismissed update modal.');
    // No marcar como "reloaded" — se puede volver a ver en la próxima sesión.
    setUpdateAvailable(false);
  };

  if (!updateAvailable) return null;

  return (
    <Dialog open={updateAvailable} onOpenChange={handleDismiss}>
      <DialogContent
        className="sm:max-w-[425px] bg-zinc-950 border-white/10 text-white rounded-[2rem] gap-6 p-8"
        // Permitir cerrar haciendo click fuera o Escape (via handleDismiss)
        onPointerDownOutside={handleDismiss}
        onEscapeKeyDown={handleDismiss}
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <VamoLogo variant="navbar" />
          <div className="w-16 h-16 bg-indigo-600/20 rounded-3xl flex items-center justify-center border border-indigo-500/30 animate-bounce">
            <VamoIcon name="rotate-ccw" className="h-8 w-8 text-indigo-400" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tighter uppercase italic">
              ¡VamO se actualizó!
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm font-medium leading-relaxed">
              Hay mejoras disponibles. Actualizá ahora para seguir usando la app
              sin interrupciones.
            </DialogDescription>
          </DialogHeader>
        </div>

        <DialogFooter className="sm:justify-center flex-col gap-2">
          {/* Botón principal */}
          <Button
            disabled={isReloading}
            onClick={handleUpdate}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-95 text-lg uppercase tracking-widest"
          >
            {isReloading ? (
              <VamoIcon name="loader" className="h-5 w-5 animate-spin" />
            ) : (
              'INSTALAR AHORA'
            )}
          </Button>

          {/* Botón secundario — escape para el usuario */}
          {!isReloading && (
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="w-full h-10 text-zinc-500 hover:text-zinc-300 font-bold text-sm rounded-2xl"
            >
              Ahora no
            </Button>
          )}
        </DialogFooter>

        <p className="text-[10px] text-zinc-600 text-center font-bold uppercase tracking-widest">
          Actualización de Sistema VamO
        </p>
      </DialogContent>
    </Dialog>
  );
}
