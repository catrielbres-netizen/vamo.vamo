import { UserProfile, ServiceType } from "./types";
import { CURRENT_TERMS_VERSION } from "./legal-config";
import { featureFlags } from "@/config/features";

export type EligibilityResult = {
  isEligible: boolean;
  reason?: string;
  code?: string;
};

const MIN_BALANCE_ARS = 0;

export const canPassengerRequestRide = (profile: UserProfile | null | undefined, isEmailVerified?: boolean): EligibilityResult => {
  if (!profile) return { isEligible: false, reason: "Perfil no encontrado", code: "NOT_FOUND" };
  if (profile.role !== "passenger") return { isEligible: false, reason: "El usuario no es pasajero", code: "INVALID_ROLE" };
  if (profile.isSuspended) return { isEligible: false, reason: "La cuenta está suspendida", code: "SUSPENDED" };
  if (!profile.profileCompleted) return { isEligible: false, reason: "Debés completar tu perfil", code: "PROFILE_INCOMPLETE" };

  // T&C Check (Centralized Version)
  const hasAccepted = profile.termsAccepted || profile.acceptedDriverTerms;
  const isCorrectVersion = profile.termsVersion === CURRENT_TERMS_VERSION;

  if (!hasAccepted || !isCorrectVersion) {
    return { isEligible: false, reason: "Aceptación de términos requerida", code: "TERMS_NOT_ACCEPTED" };
  }
  
  // Strict validations
  if (!profile.name || profile.name.trim() === "" || profile.name.includes("@")) {
    return { isEligible: false, reason: "Debés colocar tu nombre real", code: "MISSING_NAME" };
  }
  if (!profile.phone || profile.phone.trim() === "") {
    return { isEligible: false, reason: "Debés agregar un teléfono a tu perfil", code: "MISSING_PHONE" };
  }
  
  const isDemoUser = profile.email?.includes('demo_') && profile.email?.endsWith('@vamo.com');
  // const verified = isEmailVerified !== undefined ? isEmailVerified : profile.emailVerified;
  // if (verified === false && !isDemoUser) {
  //   return { isEligible: false, reason: "Debés verificar tu cuenta de email", code: "UNVERIFIED_EMAIL" };
  // }

  // Active ride check
  if (profile.activeRideId) {
      return { isEligible: false, reason: "Ya tenés un viaje activo", code: "ACTIVE_RIDE" };
  }

  return { isEligible: true };
};

export const canDriverGoOnline = (profile: UserProfile | null | undefined, isEmailVerified?: boolean): EligibilityResult => {
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

  // [AUDIT] All drivers (pro or express) MUST have an active municipal status to go online, UNLESS in Plan B.
  if (!featureFlags.vamoParticularModeEnabled) {
      const ms = profile.municipalStatus;
      
      const hasGracePeriod = ms === 'municipal_observed' && profile.observationGraceUntil;
      const isWithinGrace = hasGracePeriod && (
        profile.observationGraceUntil.toDate ? profile.observationGraceUntil.toDate() : new Date(profile.observationGraceUntil)
      ) > new Date();

      if (ms !== 'active' && !isWithinGrace) {
        const messages: Partial<Record<string, string>> = {
          municipal_observed:          "El plazo de gracia para corregir observaciones ha vencido. Regularizá tu situación para operar.",
          suspended_expired_license:   "Licencia vencida: no podés operar hasta renovarla en la municipalidad.",
          suspended_expired_insurance: "Seguro vencido: no podés operar hasta renovarlo en la municipalidad.",
          suspended_unpaid_canon:      "Canon municipal impago: regularizá el pago para volver a operar.",
          suspended_by_municipality:   "Tu habilitación fue suspendida por la municipalidad.",
          rejected_by_municipality:    "Tu solicitud de habilitación fue rechazada definitivamente.",
          pending_municipal_review:    "Habilitación municipal pendiente.",
        };
        const reason = messages[ms ?? ''] ?? "Debés completar tu habilitación municipal para operar.";
        return { isEligible: false, reason, code: "MUNICIPAL_REQUIRED" };
      }
  }

  if (!profile.approved) {
    return { isEligible: false, reason: "Tu cuenta está pendiente de aprobación final del sistema.", code: "NOT_APPROVED" };
  }
  if (!profile.profileCompleted) return { isEligible: false, reason: "Debés completar tu perfil (fotos y datos)", code: "PROFILE_INCOMPLETE" };

  // Vehicle data check (using individual fields for type safety)
  const hasVehicleData = profile.vehicleBrand && profile.vehicleModel && profile.plateNumber && profile.vehicleColor;
  
  if (!hasVehicleData) {
      return { isEligible: false, reason: "Completá los datos de tu vehículo para poder recibir viajes.", code: "VEHICLE_INCOMPLETE" };
  }

  // MANDATORY LEGAL CHECK (Unified Flags + Centralized Version)
  const hasAccepted = profile.termsAccepted || profile.acceptedDriverTerms;
  const isCorrectVersion = profile.termsVersion === CURRENT_TERMS_VERSION;

  if (!hasAccepted || !isCorrectVersion) {
      return { 
          isEligible: false, 
          reason: `Debés aceptar los términos y condiciones actualizados (${CURRENT_TERMS_VERSION})`, 
          code: "TERMS_NOT_ACCEPTED" 
      };
  }

  if (!profile.phone || profile.phone.trim() === "") {
    return { isEligible: false, reason: "Debés agregar un teléfono de contacto", code: "MISSING_PHONE" };
  }

  const isDemoUser = profile.email?.includes('demo_') || profile.email?.endsWith('@demo.com');
  const verified = isEmailVerified !== undefined ? isEmailVerified : profile.emailVerified;
  if (verified === false && !isDemoUser) {
    return { isEligible: false, reason: "Debés verificar tu cuenta para operar", code: "UNVERIFIED_EMAIL" };
  }

  // [VamO PRO] Negative Balance Control
  const balance = profile.currentBalance ?? 0;
  const negativeLimit = profile.driverSubtype === 'professional' ? -15000 : -8000;

  if (balance <= negativeLimit) {
    return { 
      isEligible: false, 
      reason: "Necesitás regularizar tu saldo para seguir recibiendo viajes.", 
      code: "NEGATIVE_BALANCE_LIMIT" 
    };
  }

  // [VamO PRO] Driver Risk Guard
  if (profile.driverRiskLevel === 'blocked') {
    return {
      isEligible: false,
      reason: "Tu cuenta requiere regularización para seguir operando.",
      code: "DRIVER_RISK_BLOCKED"
    };
  }

  return { isEligible: true };
};


export const canDriverTakeRide = (driverProfile: UserProfile, rideService: ServiceType): boolean => {
    return canDriverReceiveOffers(driverProfile, rideService).isEligible;
}

export const canDriverReceiveOffers = (profile: UserProfile | null | undefined, rideService?: ServiceType, isEmailVerified?: boolean): EligibilityResult => {
  // First, check basic online eligibility
  const basicEligibility = canDriverGoOnline(profile, isEmailVerified);
  if (!basicEligibility.isEligible) return basicEligibility;
  
  if (!profile) return { isEligible: false, reason: "Perfil no encontrado", code: "NOT_FOUND" };

  if (profile.activeRideId) return { isEligible: false, reason: "Ya estás en un viaje", code: "ACTIVE_RIDE" };

  // [VamO PRO] All drivers are equal and can receive any ride type
  // No service-type mismatch check here anymore

  return { isEligible: true };
};

/**
 * [VamO PRO] Determina si un conductor ha completado el alta mínima y está
 * listo para ser revisado y aprobado por un administrador.
 */
export const isDriverReadyForReview = (profile: any): boolean => {
  if (!profile) return false;
  // Si tiene role, debe ser driver. Si no lo tiene (ej. MunicipalProfile), asumimos que es conductor.
  if (profile.role && profile.role !== 'driver') return false;
  
  if (profile.approved === true) return false;
  
  // En MunicipalProfile el campo es municipalStatus. 
  // Si está aprobado municipalmente, tampoco es "pendiente".
  if (profile.municipalStatus === 'active') return false; 
  if (profile.isSuspended === true) return false;
  
  // Alta mínima requerida para aparecer en "Pendientes":
  // Unificamos a photoURL y vehicleFrontPhotoURL
  const hasProfilePhoto  = !!(profile.photoURL || profile.profilePhotoUrl);
  const hasVehiclePhoto  = !!(profile.vehicleFrontPhotoURL || profile.vehicleFrontPhotoUrl);
  
  // Backward compatibility check for review
  const hasAcceptedTerms = profile.termsAccepted === true || profile.acceptedDriverTerms === true || !!profile.termsAcceptedAt;
  
  return hasProfilePhoto && hasVehiclePhoto && hasAcceptedTerms;
};
