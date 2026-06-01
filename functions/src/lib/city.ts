/**
 * [VamO PRO] Neutral City Helpers
 * Used by multiple modules without causing circular dependencies with index.ts.
 */

/**
 * Convierte un nombre de ciudad a su clave normalizada.
 * Ejemplo: "Río Negro" → "rio-negro" | "Rawson" → "rawson"
 */
export function normalizeCityKey(city: string): string {
    const normalized = city
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    // Mapeo regional para VamO (Rawson y Playa Unión comparten el mismo Pozo y Matching)
    if (normalized === 'playa-union' || normalized === 'playa_union' || normalized === 'playa-unions') {
        return 'rawson';
    }

    return normalized;
}

/**
 * Wrapper for normalizeCityKey with fallback.
 */
export function normalizeCity(city?: string | null): string {
    return normalizeCityKey(city || "");
}
