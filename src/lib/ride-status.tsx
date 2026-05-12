

// @/lib/ride-status.tsx

/**
 * @fileOverview
 * Single source of truth for all ride statuses in the VamO application.
 * This object maps each ride status string to its user-facing text,
 * icon, and progress bar percentage for the UI.
 */
export const RideStatusInfo: {
    [key: string]: { text: string; icon: string; progress: number };
} = {
    // === ACTIVE RIDE FLOW ===
    scheduled: {
      text: 'Viaje programado',
      icon: 'calendar',
      progress: 10,
    },
    searching: {
      text: 'Buscando conductor',
      icon: 'circle-dashed',
      progress: 25,
    },
    driver_assigned: {
      text: 'Conductor en camino',
      icon: 'car',
      progress: 60,
    },
    driver_arrived: {
      text: 'Tu conductor ha llegado',
      icon: 'user-check',
      progress: 75,
    },
    in_progress: {
      text: 'Viaje en curso',
      icon: 'route',
      progress: 90,
    },
    paused: {
        text: 'Viaje en espera',
        icon: 'hourglass',
        progress: 90,
    },

    // === TERMINAL (FINAL) STATES ===
    completed: { text: 'Viaje finalizado', icon: 'check-circle', progress: 100 },
    cancelled: { text: 'Viaje cancelado', icon: 'x-circle', progress: 0 },
};

// Set of states representing a ride that is active from the passenger's perspective.
export const ACTIVE_RIDE_STATES = [
  "scheduled",
  "searching",
  "driver_assigned",
  "driver_arrived",
  "in_progress",
  "paused"
];

// Set of states representing a ride that is no longer active.
export const FINAL_RIDE_STATES = [
  "completed",
  "cancelled",
];

// Set of states that should lock the main UI navigation for the passenger.
export const VISUALLY_LOCKED_STATUSES = [
  "scheduled",
  "searching",
  "driver_assigned",
  "driver_arrived",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
];

    

    