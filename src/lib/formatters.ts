/**
 * Safe numeric formatters to prevent UI crashes when dealing with undefined/null values from Firestore.
 */

export function safeFixed(value: unknown, digits = 1, fallback = "0.0"): string {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
}

export function safeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatDistance(meters: unknown): string {
    if (meters === null || meters === undefined) return '—';
    const m = typeof meters === 'number' ? meters : Number(meters);
    if (!Number.isFinite(m) || m < 0) return '—';
    if (m < 1000) return `${m.toFixed(0)} m`;
    return `${(m / 1000).toFixed(1)} km`;
}

export function formatRating(rating: unknown, fallback = '5.0'): string {
    return safeFixed(rating, 1, fallback);
}
