export const featureFlags = {
    vamoParticularModeEnabled: true,
    municipalModeEnabled: false,
    trafficPanelEnabled: false,
    taxiStopsEnabled: false,
    taxiRemisEnabled: false,
    passengerWalletTopupEnabled: false,
    simpleDistanceMatchingEnabled: true,
    simpleGlobalFareEnabled: false,
    mercadoPagoRequiredEnabled: true,
    mercadoPagoSplitEnabled: false,
    supportEmailEnabled: true
};

/**
 * PLAN_B_DRIVER_SUBTYPE = 'express'
 * Por razones de compatibilidad histórica, el subtipo comercial "Particular"
 * está unificado bajo la palabra clave interna "express" en la base de datos, 
 * reglas, y motor de tarifas.
 */
export const PLAN_B_DRIVER_SUBTYPE = 'express';
