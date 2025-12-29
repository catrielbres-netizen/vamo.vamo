// lib/pricing.ts

export type ServiceType = "premium" | "privado" | "express";

const BASE_FARE = 1400;
const PRICE_PER_100M = 120;
export const WAITING_PER_MIN = 100;

export function calculateFare({
  distanceMeters,
  waitingMinutes = 0,
  service,
  isNight = false,
}: {
  distanceMeters: number;
  waitingMinutes?: number;
  service: ServiceType;
  isNight?: boolean;
}) {
  let distanceCost = Math.ceil(distanceMeters / 100) * PRICE_PER_100M;
  let waitCost = waitingMinutes * WAITING_PER_MIN;

  let total = BASE_FARE + distanceCost + waitCost;

  if (service === "privado") total *= 0.9;
  if (service === "express") total *= 0.75;
  if (isNight) total *= 1.05;

  return Math.round(total);
}
