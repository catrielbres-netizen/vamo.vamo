/**
 * [VamO PREMIA] Safely resolves and normalizes the city key from passenger profile or custom claims.
 * Returns normalized string or null if no valid city can be determined.
 */
export function resolveCityKey(profile?: any, claims?: any): string | null {
  const getNormalized = (val: any): string | null => {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim().toLowerCase();
    if (!trimmed) return null;

    // Normalizations:
    // Rawson => rawson
    // rawson => rawson
    // Playa Unión => rawson
    // playa_union => rawson
    // playa unión => rawson
    if (
      trimmed === 'rawson' || 
      trimmed === 'playa unión' || 
      trimmed === 'playa union' || 
      trimmed === 'playa_union'
    ) {
      return 'rawson';
    }

    if (trimmed === 'puerto madryn' || trimmed === 'madryn' || trimmed === 'puerto_madryn') {
      return 'madryn';
    }

    if (trimmed === 'córdoba' || trimmed === 'cordoba') {
      return 'cordoba';
    }

    if (trimmed === 'paraná' || trimmed === 'parana') {
      return 'parana';
    }

    return trimmed;
  };

  // Try different fields in order of reliability
  const keysToTry = [
    profile?.cityKey,
    profile?.ck,
    profile?.city,
    profile?.municipality,
    claims?.ck
  ];

  for (const key of keysToTry) {
    const normalized = getNormalized(key);
    if (normalized) return normalized;
  }

  return null;
}
