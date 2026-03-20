// lib/pricing.ts
// --- ESTE ARCHIVO ESTÁ OBSOLETO ---
// La lógica de cálculo de tarifas se ha migrado de forma segura al backend
// en la Cloud Function `createRideV1`.
// Este archivo se mantiene por ahora para evitar errores de importación,
// pero su contenido ya no se utiliza para el cálculo real de tarifas.

export type ServiceType = "premium" | "express";

// --- Constantes de Referencia ---
// Estas constantes pueden ser útiles para mostrar información en la UI,
// pero NO deben usarse para calcular el costo final de un viaje.

export const WAITING_PER_MIN_DAY = 220;
export const WAITING_PER_MIN_NIGHT = 277;
// Exportación genérica para compatibilidad con componentes que puedan usarla
export const WAITING_PER_MIN = WAITING_PER_MIN_DAY;

/**
 * @deprecated Esta función ha sido reemplazada por la Cloud Function `createRideV1`.
 * No utilizar para cálculos de tarifas.
 */
export function calculateFare({
  distanceMeters,
  service,
}: {
  distanceMeters: number;
  service: ServiceType;
}) {
  console.warn("La función `calculateFare` del cliente está obsoleta y no debe usarse.");
  // Devuelve una estimación muy básica y no confiable solo como fallback visual.
  const base = service === "premium" ? 1500 : 1350;
  const cost = (distanceMeters / 100) * 150;
  return base + cost;
}
