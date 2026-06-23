/**
 * Configuración central de Feature Flags para VamO
 * Plan B / Particular Mode
 */

export const featureFlags = {
  // Modo Plan B activo: prioriza conductores particulares, oculta intermediación municipal
  vamoParticularModeEnabled: false,

  // Paneles y modos a ocultar en Plan B
  municipalModeEnabled: true,
  trafficPanelEnabled: true,
  taxiStopsEnabled: true,
  taxiRemisEnabled: true,
  showMunicipalPendingBanner: true,
  
  // Wallet del pasajero: desactivar recarga
  passengerWalletTopupEnabled: true,

  // Matching y Tarifas
  simpleDistanceMatchingEnabled: true,
  simpleGlobalFareEnabled: false,

  // Mercado Pago
  mercadoPagoRequiredEnabled: false,
  mercadoPagoSplitEnabled: false, // Pendiente técnico

  // Soporte
  supportEmailEnabled: true,
  supportEmailAddress: 'soporte@vamoapp.com',
};

export type FeatureFlags = typeof featureFlags;

/**
 * PLAN_B_DRIVER_SUBTYPE = 'express'
 * Por razones de compatibilidad histórica, el subtipo comercial "Particular"
 * está unificado bajo la palabra clave interna "express" en la base de datos, 
 * reglas, y motor de tarifas.
 */
export const PLAN_B_DRIVER_SUBTYPE = 'express';
