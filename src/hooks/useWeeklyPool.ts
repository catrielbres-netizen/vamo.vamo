'use client';

/**
 * useWeeklyPool — thin wrapper sobre WeeklyPoolContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes (P0): este hook abría 3 onSnapshot propios cada vez que WeeklyPoolCard
 * se montaba, es decir: en cada navegación a /driver/rides.
 *
 * Después (P0 optimizado): el hook simplemente consume el contexto
 * WeeklyPoolProvider, que está montado UNA SOLA VEZ en DriverClientLayout.
 * Los listeners nunca se cierran al cambiar de tab principal.
 *
 * API pública: idéntica a la versión anterior — no requiere cambios en consumers.
 */

import { useWeeklyPoolContext, WeeklyPoolContextValue } from '@/context/WeeklyPoolProvider';

// Re-exportar el tipo para compatibilidad con cualquier consumer que lo importe
export type { WeeklyPoolContextValue as WeeklyPoolStatus };

/**
 * @returns Los datos del Pozo Semanal desde el provider persistente.
 * No abre listeners. No crea suscripciones. Solo lee del contexto.
 */
export function useWeeklyPool(): WeeklyPoolContextValue {
    return useWeeklyPoolContext();
}
