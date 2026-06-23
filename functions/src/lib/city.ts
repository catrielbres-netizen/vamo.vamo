/**
 * [VamO PRO] Neutral City Helpers
 * Used by multiple modules without causing circular dependencies with index.ts.
 */

/**
 * Convierte un nombre de ciudad a su clave normalizada.
 * Ejemplo: "Río Negro" → "rio-negro" | "Rawson" → "rawson"
 */
export function normalizeCityKey(city: string): string {
    return canonicalCityKey(city);
}

/**
 * Wrapper for normalizeCityKey with fallback.
 */
export function normalizeCity(city?: string | null): string {
    return normalizeCityKey(city || "");
}

/**
 * Returns a canonical, robust cityKey.
 * Replaces dashes with underscores, lowercases, removes accents,
 * and converts specific variations to their canonical representation.
 * Prioritizes underscores `_` over dashes `-` as requested by the user.
 */
export function canonicalCityKey(input: string | null | undefined): string {
    if (!input) return '';

    let key = input.trim().toLowerCase();

    // Remove accents
    key = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Replace dashes and spaces with underscores
    key = key.replace(/[-\s]+/g, '_');

    // Strip out any remaining non-alphanumeric/underscore characters
    key = key.replace(/[^a-z0-9_]/g, '');

    // Regional mapping
    if (key === 'playa_union' || key === 'playa_unions') {
        return 'rawson';
    }

    return key;
}
