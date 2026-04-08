/**
 * [VamO PRO] Neutral City Helpers
 * Used by multiple modules without causing circular dependencies with index.ts.
 */

/**
 * Convierte un nombre de ciudad a su clave normalizada.
 * Ejemplo: "Río Negro" → "rio-negro" | "Rawson" → "rawson"
 */
export function normalizeCityKey(city: string): string {
    return city
        .toLowerCase()
        .normalize('NFD') // separa caracteres de sus diacríticos
        .replace(/[\u0300-\u036f]/g, '') // elimina diacríticos
        .replace(/[^a-z0-9]+/g, '-')    // reemplaza caracteres especiales con guión
        .replace(/^-+|-+$/g, '');        // elimina guiones al inicio/fin
}

/**
 * Wrapper for normalizeCityKey with fallback.
 */
export function normalizeCity(city?: string | null): string {
    return normalizeCityKey(city || "");
}
