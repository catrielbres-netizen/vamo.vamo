import { logger } from "firebase-functions";
import { UserProfile, ServiceType } from "./types";

export type EligibilityResult = {
  isEligible: boolean;
  reason?: string;
  code?: string;
};

const MIN_BALANCE_ARS = parseInt(process.env.MIN_BALANCE_ARS || '0');

export const canPassengerRequestRide = (
    profile: UserProfile | null | undefined, 
    isEmailVerified?: boolean,
    cashBalance?: number
): EligibilityResult => {
  if (!profile) return { isEligible: false, reason: "Perfil no encontrado", code: "NOT_FOUND" };
  if (profile.role !== "passenger") return { isEligible: false, reason: "El usuario no es pasajero", code: "INVALID_ROLE" };
  
  if (!profile.profileCompleted) return { isEligible: false, reason: "Debés completar tu perfil", code: "PROFILE_INCOMPLETE" };
  
  // MANDATORY LEGAL CHECK (v1.3)
  const CURRENT_TERMS_V = 'v1.3';
  const hasAccepted = profile.termsAccepted || profile.acceptedDriverTerms;
  const isCorrectVersion = profile.termsVersion === CURRENT_TERMS_V;

  if (!hasAccepted || !isCorrectVersion) {
      return { isEligible: false, reason: "Debés aceptar los nuevos Términos y Condiciones", code: "TERMS_NOT_ACCEPTED" };
  }
  
  // Strict validations
  if (!profile.name || profile.name.trim() === "" || profile.name.includes("@")) {
    return { isEligible: false, reason: "Debés colocar tu nombre real", code: "MISSING_NAME" };
  }
  if (!profile.phone || profile.phone.trim() === "") {
    return { isEligible: false, reason: "Debés agregar un teléfono a tu perfil", code: "MISSING_PHONE" };
  }
  
  // Active ride check
  if (profile.activeRideId) {
      return { isEligible: false, reason: "Ya tenés un viaje activo", code: "ACTIVE_RIDE" };
  }

  // Debt check: Source of truth is cashBalance from Unified Wallet
  const balance = cashBalance ?? profile.currentBalance ?? 0;
  if (balance < 0) {
      return { isEligible: false, reason: "Tenés una deuda pendiente por cancelación. Recargá saldo para continuar.", code: "NEGATIVE_BALANCE" };
  }

  return { isEligible: true };
};

export const canDriverGoOnline = (
    profile: UserProfile | null | undefined, 
    isEmailVerified?: boolean,
    cashBalance?: number
): EligibilityResult => {
  if (!profile) return { isEligible: false, reason: "Perfil no encontrado", code: "NOT_FOUND" };
  if (profile.role !== "driver") return { isEligible: false, reason: "El usuario no es conductor", code: "INVALID_ROLE" };
  if (profile.isSuspended || profile.adminSuspended || profile.municipalSuspended || profile.trafficSuspended) {
      const isTraffic = profile.trafficSuspended || (profile.isSuspended && profile.suspensionSource === 'traffic');
      const isMunicipal = profile.municipalSuspended || (profile.isSuspended && profile.suspensionSource === 'municipal');
      const isAdmin = profile.adminSuspended || (profile.isSuspended && profile.suspensionSource === 'admin');

      let message = "Tu cuenta está suspendida.";
      if (isAdmin) {
          message = "Suspendido por Administración VamO.";
      } else if (isMunicipal) {
          message = "Suspendido por Municipalidad.";
      } else if (isTraffic) {
          message = "Suspendido preventivamente por el área de Tránsito.";
      }
      return { isEligible: false, reason: message, code: "SUSPENDED" };
  }
  
  if (profile.blockedUntil && (profile.blockedUntil as any).toMillis() > Date.now()) {
      const dateStr = new Date((profile.blockedUntil as any).toMillis()).toLocaleString('es-AR');
      return { isEligible: false, reason: `Tu cuenta está bloqueada temporalmente hasta ${dateStr}`, code: "BLOCKED_TEMPORAL" };
  }

  if (profile.municipalStatus === 'municipal_observed' && profile.observationGraceUntil) {
      const graceDate = profile.observationGraceUntil.toDate ? profile.observationGraceUntil.toDate() : new Date(profile.observationGraceUntil);
      if (graceDate < new Date()) {
          return { 
              isEligible: false, 
              reason: "El plazo de gracia para corregir observaciones municipales ha vencido. Por favor regularizá tu situación.", 
              code: "NOT_APPROVED" 
          };
      }
  }

    // [VamO PRO] Automated Expiration Blocks (Real-time check)
    const now = Date.now();
    const expiryChecks = [
        { key: 'licenseExpiry',          status: 'suspended_expired_license',   reason: "Licencia vencida: no podés operar hasta renovarla." },
        { key: 'insuranceExpiry',        status: 'suspended_expired_insurance', reason: "Seguro vencido: no podés operar hasta renovarlo." },
        { key: 'itvExpiry',              status: 'suspended_expired_itv',       reason: "ITV/VTV vencido: no podés operar hasta renovarlo." },
        { key: 'canonExpiry',            status: 'suspended_unpaid_canon',      reason: "Canon municipal vencido o impago." },
    ];

    for (const check of expiryChecks) {
        const expiry = (profile as any)[check.key];
        if (expiry) {
            const expiryDate = expiry.toDate ? expiry.toDate() : new Date(expiry);
            if (expiryDate.getTime() < now) {
                return { isEligible: false, reason: check.reason, code: "EXPIRED_DOCS" };
            }
        }
    }
    
    // Canon Status Check
    if (profile.canonStatus === 'overdue') {
        return { isEligible: false, reason: "Canon municipal impago.", code: "UNPAID_CANON" };
    }

    // All drivers require platform approval
  if (!profile.approved) {
    const ms = profile.municipalStatus;
    if (ms && ms !== 'active' && ms !== 'pending') {
      const messages: Partial<Record<string, string>> = {
        municipal_observed:          "Tu habilitación tiene observaciones que requieren tu atención.",
        suspended_expired_license:   "Licencia vencida: no podés operar hasta renovarla en la municipalidad.",
        suspended_expired_insurance: "Seguro vencido: no podés operar hasta renovarlo en la municipalidad.",
        suspended_expired_itv:       "ITV/VTV vencido: no podés operar hasta renovarlo en la municipalidad.",
        suspended_unpaid_canon:      "Canon municipal impago: regularizá el pago para volver a operar.",
        suspended_by_municipality:   "Tu habilitación fue suspendida por la municipalidad.",
        rejected_by_municipality:    "Tu solicitud de habilitación fue rechazada definitivamente.",
      };
      const reason = messages[ms ?? ''] ?? "Tu cuenta está pendiente de aprobación.";
      return { isEligible: false, reason, code: "NOT_APPROVED" };
    }
    return { isEligible: false, reason: "Tu cuenta está pendiente de aprobación final del sistema.", code: "NOT_APPROVED" };
  }

  if (!profile.profileCompleted) return { isEligible: false, reason: "Debés completar tu perfil (fotos y datos)", code: "PROFILE_INCOMPLETE" };

  // Vehicle data check
  if (!profile.vehicle || !profile.vehicle.brand || !profile.vehicle.model || !profile.vehicle.plate) {
      return { isEligible: false, reason: "Completá los datos de tu vehículo para poder recibir viajes.", code: "VEHICLE_INCOMPLETE" };
  }
  const color = profile.vehicle.color || (profile as any).vehicleColor;
  if (!color) {
      return { isEligible: false, reason: "Completá el color de tu vehículo para poder recibir viajes.", code: "VEHICLE_INCOMPLETE" };
  }

  // MANDATORY LEGAL CHECK (v1.3)
  const CURRENT_TERMS_V = 'v1.3';
  const hasAccepted = profile.termsAccepted || profile.acceptedDriverTerms;
  const isCorrectVersion = profile.termsVersion === CURRENT_TERMS_V;

  if (!hasAccepted || !isCorrectVersion) {
      return { isEligible: false, reason: "Debés aceptar los nuevos Términos y Condiciones", code: "TERMS_NOT_ACCEPTED" };
  }

  if (!profile.phone || profile.phone.trim() === "") {
    return { isEligible: false, reason: "Debés agregar un teléfono a tu perfil", code: "MISSING_PHONE" };
  }

  const verified = (isEmailVerified === true) || (profile.emailVerified === true);
  if (!verified && !profile.approved) {
    return { isEligible: false, reason: "Debés verificar tu cuenta de email para operar", code: "UNVERIFIED_EMAIL" };
  }

  // [VamO PRO] Negative Balance Control
  const balance = cashBalance ?? profile.currentBalance ?? 0;
  const negativeLimit = profile.driverSubtype === 'professional' ? -15000 : -8000;

  if (balance <= negativeLimit) {
    return { 
      isEligible: false, 
      reason: "Necesitás regularizar tu saldo para seguir recibiendo viajes.", 
      code: "NEGATIVE_BALANCE_LIMIT" 
    };
  }

  return { isEligible: true };
};

export const canDriverTakeRide = (driverProfile: UserProfile, rideService: ServiceType, cashBalance?: number): boolean => {
    return canDriverReceiveOffers(driverProfile, rideService, undefined, undefined, cashBalance).isEligible;
}

export const canDriverReceiveOffers = (
    profile: UserProfile | null | undefined, 
    rideService?: ServiceType, 
    isEmailVerified?: boolean,
    rideMeta?: { isDiscountApplied?: boolean; hasPet?: boolean; paymentMethod?: string },
    cashBalance?: number
): EligibilityResult => {
  if (!profile) return { isEligible: false, reason: "Perfil no encontrado", code: "NOT_FOUND" };

  // Negative Balance Guard (Strict)
  const balance = cashBalance ?? profile.currentBalance ?? 0;
  const negativeLimit = profile.driverSubtype === 'professional' ? -15000 : -8000;

  if (balance <= negativeLimit) {
      logger.info(`[WALLET_GUARD] driverId=${profile.uid} balance=${balance} limit=${negativeLimit} reason=BLOCKED_NEGATIVE`);
      return { 
          isEligible: false, 
          reason: "Saldo insuficiente (límite negativo alcanzado)", 
          code: "NEGATIVE_BALANCE_LIMIT" 
      };
  }

  // [VamO PRO] Driver Risk Guard
  if (profile.driverRiskLevel === 'blocked') {
      logger.warn(`[DRIVER_RISK_BLOCKED] uid=${profile.uid} score=${profile.driverRiskScore} reasons=${profile.riskReasons?.join(', ')}`);
      return {
          isEligible: false,
          reason: "Tu cuenta requiere regularización para seguir recibiendo viajes.",
          code: "DRIVER_RISK_BLOCKED"
      };
  }

  if (profile.driverRiskLevel === 'high') {
      logger.info(`[DRIVER_RISK_WARNING] uid=${profile.uid} score=${profile.driverRiskScore}`);
  }

  // First, check basic online eligibility
  const basicEligibility = canDriverGoOnline(profile, isEmailVerified, cashBalance);
  if (!basicEligibility.isEligible) return basicEligibility;

  if (profile.activeRideId) {
      logger.warn(`[ELIGIBILITY] Driver ${profile.uid} rejected: already in ride ${profile.activeRideId}`);
      return { isEligible: false, reason: "Ya estás en un viaje", code: "ACTIVE_RIDE" };
  }

  // Mercado Pago Guard
  if (rideMeta?.paymentMethod === 'mercadopago' && !profile.mpLinked) {
      logger.info(`[MP_GUARD] Driver ${profile.uid} discarded: ride is MP but driver is not linked`);
      return { isEligible: false, reason: "El pasajero paga con Mercado Pago y no tienes cuenta vinculada", code: "MP_NOT_LINKED" };
  }

  // [VamO PRO] All drivers are equal and can receive any ride type
  // No service-type mismatch check here anymore
  
  // VamO PRO: Driver Preferences
  const prefs = profile.driverPreferences || { acceptsExpress: true, acceptsDiscountedRides: true, acceptsPets: true };
  
  if (rideService === 'express' && !prefs.acceptsExpress) {
      return { isEligible: false, reason: "Preferís no recibir viajes Express", code: "PREFERENCE_MISMATCH" };
  }
  
  if (rideMeta?.hasPet && !prefs.acceptsPets) {
      return { isEligible: false, reason: "Preferís no recibir mascotas", code: "PREFERENCE_MISMATCH" };
  }

  return { isEligible: true };
};
