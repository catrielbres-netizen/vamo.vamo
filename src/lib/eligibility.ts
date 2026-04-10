import { UserProfile, ServiceType } from "./types";
import { CURRENT_TERMS_VERSION } from "./legal-config";

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
  const verified = isEmailVerified !== undefined ? isEmailVerified : profile.emailVerified;
  if (verified === false && !isDemoUser) {
    return { isEligible: false, reason: "Debés verificar tu cuenta de email", code: "UNVERIFIED_EMAIL" };
  }

  // Active ride check
  if (profile.activeRideId) {
      return { isEligible: false, reason: "Ya tenés un viaje activo", code: "ACTIVE_RIDE" };
  }

  return { isEligible: true };
};

export const canDriverGoOnline = (profile: UserProfile | null | undefined, isEmailVerified?: boolean): EligibilityResult => {
  if (!profile) return { isEligible: false, reason: "Perfil no encontrado", code: "NOT_FOUND" };
  if (profile.role !== "driver") return { isEligible: false, reason: "El usuario no es conductor", code: "INVALID_ROLE" };
  if (profile.isSuspended) return { isEligible: false, reason: "Tu cuenta está suspendida", code: "SUSPENDED" };

  // ── VamoMuni: conductores express requieren habilitación municipal ─────────
  if (profile.driverSubtype === 'express') {
    const ms = profile.municipalStatus;
    if (!ms || ms !== 'active') {
      const messages: Partial<Record<string, string>> = {
        pending_municipal_review:    "Pendiente de aprobación municipal. Pasá por la municipalidad para activar tu cuenta.",
        municipal_observed:          "Tu habilitación tiene observaciones que requieren tu atención.",
        municipal_approved:          "Tu habilitación está aprobada. Se activará cuando tu documentación esté vigente.",
        renewal_under_review:        "Tu renovación de documentos está siendo revisada por la municipalidad.",
        suspended_expired_license:   "Licencia vencida: no podés operar hasta renovarla en la municipalidad.",
        suspended_expired_insurance: "Seguro vencido: no podés operar hasta renovarlo en la municipalidad.",
        suspended_unpaid_canon:      "Canon municipal impago: regularizá el pago para volver a operar.",
        suspended_by_municipality:   "Tu habilitación fue suspendida por la municipalidad.",
        rejected_by_municipality:    "Tu solicitud de habilitación fue rechazada definitivamente.",
      };
      const reason = messages[ms ?? ''] ?? "Habilitación municipal requerida para operar.";
      return { isEligible: false, reason, code: "MUNICIPAL_BLOCKED" };
    }
  }

  if (!profile.approved) return { isEligible: false, reason: "Tu cuenta está pendiente de aprobación inicial", code: "NOT_APPROVED" };
  if (!profile.profileCompleted) return { isEligible: false, reason: "Debés completar tu perfil (fotos y datos)", code: "PROFILE_INCOMPLETE" };

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

  const balance = profile.currentBalance ?? 0;
  if (balance < MIN_BALANCE_ARS) {
    return { isEligible: false, reason: "Tu saldo es negativo. Recargá crédito para recibir viajes.", code: "LOW_BALANCE" };
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

  if (rideService) {
    const services = profile.servicesOffered || { premium: false, express: false };
    if ((rideService === 'premium' || rideService === 'normal') && !services.premium) {
        return { isEligible: false, reason: "No ofrecés servicio profesional", code: "SERVICE_MISMATCH" };
    }
    if (rideService === 'express' && !services.express) {
        return { isEligible: false, reason: "No ofrecés servicio Express", code: "SERVICE_MISMATCH" };
    }
  }

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
