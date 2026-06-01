import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value?: number) {
  if (typeof value !== 'number') return '$0';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Normaliza fechas que vienen de Firestore (SDK o JSON serializado)
 */
export function parseFirestoreDate(date: any): Date | null {
  if (!date) return null;
  
  // 1. Timestamp real (SDK)
  if (typeof date.toDate === 'function') return date.toDate();
  
  // 2. Objeto plano {seconds, nanoseconds} (Serialización JSON)
  if (typeof date.seconds === 'number') {
    return new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
  }
  
  // 3. String ISO o Number (Unix ms)
  if (typeof date === 'string' || typeof date === 'number') {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // 4. Objeto Date
  if (date instanceof Date) return date;

  return null;
}

export function resolveUserRole(profile: any, claims: any): string | null {
  if (!profile && !claims) return null;
  return (
    claims?.role ||
    claims?.r ||
    profile?.role ||
    profile?.trafficRole ||
    profile?.municipalRole ||
    profile?.adminRole ||
    null
  );
}
