/**
 * Capa Centralizada de Telemetría VamO
 * 
 * Este módulo centraliza y sanitiza todos los logs del frontend para evitar
 * exposición de datos sensibles, estandarizar los eventos y preparar la 
 * integración futura con Crashlytics, Google Analytics o sistemas similares.
 */

import { TelemetryService } from './index';

let telemetryServiceInstance: TelemetryService | null = null;

export const setTelemetryService = (service: TelemetryService) => {
  telemetryServiceInstance = service;
};

// Sanitizadores
export const maskEmail = (email?: string | null): string => {
  if (!email || !email.includes('@')) return '***';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `***@${domain}`;
  return `${name.substring(0, 2)}***@${domain}`;
};

export const maskPhone = (phone?: string | null): string => {
  if (!phone) return '***';
  const str = String(phone);
  if (str.length <= 4) return '***';
  return `***${str.substring(str.length - 4)}`;
};

export const safeUserId = (userId?: string | null): string => {
  if (!userId) return 'anonymous';
  if (userId.length > 8) {
    return `${userId.substring(0, 8)}...`;
  }
  return userId;
};

const roundCoord = (val: any): any => {
  if (typeof val === 'number') {
    return Math.round(val * 1000) / 1000; // 3 decimal places (~110m accuracy)
  }
  if (typeof val === 'string' && !isNaN(Number(val))) {
    return Math.round(Number(val) * 1000) / 1000;
  }
  return val;
};

export const sanitizePayload = (payload: any): any => {
  if (!payload) return payload;
  
  if (Array.isArray(payload)) {
    return payload.map(item => sanitizePayload(item));
  }

  if (typeof payload !== 'object') return payload;

  // Avoid mutating original object if possible, but handle Date or special objects
  if (payload instanceof Date) return payload;

  const sanitized = { ...payload };
  const sensitiveKeys = [
    'password', 'token', 'fcmtoken', 'secret', 'walletbalance', 
    'cvv', 'cardnumber', 'dni', 'cbu', 'alias', 'key', 'claves', 
    'pin', 'creditcard', 'balance', 'monto', 'price', 'amount', 'tarjeta'
  ];
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveKeys.some(k => lowerKey.includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey.includes('email')) {
      sanitized[key] = maskEmail(sanitized[key]);
    } else if (lowerKey.includes('phone') || lowerKey.includes('telefono') || lowerKey.includes('celular')) {
      sanitized[key] = maskPhone(sanitized[key]);
    } else if (['lat', 'lng', 'latitude', 'longitude'].includes(lowerKey)) {
      sanitized[key] = roundCoord(sanitized[key]);
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizePayload(sanitized[key]); // Recursivo para objetos aninados
    }
  }

  return sanitized;
};

// Flags de entorno
const isProd = process.env.NODE_ENV === 'production';

// Helpers internos para logger defensivo
const safeLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string, payload?: any) => {
  try {
    const sanitizedPayload = payload ? sanitizePayload(payload) : undefined;
    
    // En producción, minimizamos el ruido de consola. 
    // Los errores sí los logueamos en consola siempre.
    if (isProd && level !== 'error') {
      return; 
    }

    if (sanitizedPayload !== undefined) {
      console[level](`[${level.toUpperCase()}] ${message}`, sanitizedPayload);
    } else {
      console[level](`[${level.toUpperCase()}] ${message}`);
    }
  } catch (e) {
    // Fallback absoluto. Nunca romper la app por un log.
    console.warn('[LOGGER_FAIL] Failed to execute logger safely.');
  }
};

// Funciones de Logger Básicas
export const logInfo = (message: string, payload?: any) => safeLog('info', message, payload);
export const logWarn = (message: string, payload?: any) => safeLog('warn', message, payload);
export const logError = (message: string, payload?: any) => safeLog('error', message, payload);
export const logDebug = (message: string, payload?: any) => safeLog('debug', message, payload);

// Sistema de Eventos
export const trackEvent = (eventName: string, payload?: any) => {
  try {
    const sanitizedPayload = payload ? sanitizePayload(payload) : {};
    
    if (!isProd) {
      console.log(`[EVENT_TRACKED] ${eventName}`, sanitizedPayload);
    }

    if (telemetryServiceInstance) {
      let type: any = 'passenger_activity';
      if (eventName.startsWith('ride_') || eventName.startsWith('passenger_ride_') || eventName.startsWith('driver_offer_')) {
        type = 'ride_lifecycle';
      } else if (eventName.startsWith('wallet_') || eventName.startsWith('receipt_')) {
        type = 'revenue';
      } else if (eventName.startsWith('map_')) {
        type = 'matching';
      } else if (eventName.startsWith('panic_') || eventName.startsWith('safety_')) {
        type = 'security';
      } else if (eventName.startsWith('protected_') || eventName.startsWith('role_') || eventName.endsWith('_panel_loaded')) {
        type = 'municipal_operation';
      }

      // Fire-and-forget, wrapping in try-catch/promise catch
      telemetryServiceInstance.trackEvent({
        type,
        eventName,
        metadata: sanitizedPayload
      }).catch(err => {
        // Silent catch for telemetry
        console.warn(`[TELEMETRY_TRACK_FAIL] ${eventName}`, err);
      });
    }
  } catch (e) {
    console.warn(`[TRACK_EVENT_FAIL] Failed to track ${eventName}`);
  }
};

// Eventos tipados
export const trackRideEvent = (
  eventName: 
    | 'passenger_ride_create_attempt' | 'passenger_ride_create_success' | 'passenger_ride_create_error'
    | 'driver_offer_received' | 'driver_offer_accept_attempt' | 'driver_offer_accept_success' | 'driver_offer_accept_error'
    | 'ride_cancel_attempt' | 'ride_cancel_success' | 'ride_cancel_error'
    | 'ride_start_attempt' | 'ride_start_success'
    | 'ride_finish_attempt' | 'ride_finish_success' | 'ride_receipt_viewed',
  payload?: any
) => trackEvent(eventName, payload);

export const trackWalletEvent = (
  eventName: 
    | 'wallet_balance_loaded' | 'wallet_balance_error' 
    | 'wallet_payment_attempt' | 'wallet_payment_error' 
    | 'receipt_financial_snapshot_viewed',
  payload?: any
) => trackEvent(eventName, payload);

export const trackMapEvent = (
  eventName: 
    | 'map_loaded' | 'map_location_permission_denied' 
    | 'map_driver_marker_selected' | 'map_geolocation_error' 
    | 'map_live_tracking_error',
  payload?: any
) => trackEvent(eventName, payload);

export const trackNotificationEvent = (
  eventName: 
    | 'notification_permission_requested' | 'notification_permission_granted' 
    | 'notification_permission_denied' | 'push_token_refresh_error' 
    | 'service_worker_update_detected' | 'service_worker_error',
  payload?: any
) => trackEvent(eventName, payload);

export const trackSecurityEvent = (
  eventName: 
    | 'panic_button_opened' | 'panic_alert_attempt' 
    | 'panic_alert_success' | 'panic_alert_error' 
    | 'safety_recording_start_attempt' | 'safety_recording_upload_error',
  payload?: any
) => trackEvent(eventName, payload);

export const trackRoleEvent = (
  eventName: 
    | 'protected_route_access_denied' | 'role_guard_redirect' 
    | 'municipal_panel_loaded' | 'traffic_panel_loaded' 
    | 'admin_panel_loaded',
  payload?: any
) => trackEvent(eventName, payload);

const Logger = {
  info: logInfo,
  warn: logWarn,
  error: logError,
  debug: logDebug,
  logInfo,
  logWarn,
  logError,
  logDebug,
  trackEvent,
  trackRideEvent,
  trackWalletEvent,
  trackMapEvent,
  trackNotificationEvent,
  trackSecurityEvent,
  trackRoleEvent
};

export default Logger;
