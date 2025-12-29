// lib/pricing.ts

export type ServiceType = "premium" | "privado" | "express";

const BASE_FARE = 1400;
const PRICE_PER_100M = 120;
const WAITING_PER_MIN = 100;

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
  let fare =
    BASE_FARE +
    (distanceMeters / 100) * PRICE_PER_100M +
    waitingMinutes * WAITING_PER_MIN;

  if (service === "privado") fare *= 0.9;
  if (service === "express") fare *= 0.75;
  if (isNight) fare *= 1.05;

  return Math.round(fare);
}
