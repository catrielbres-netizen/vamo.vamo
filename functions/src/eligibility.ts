import { UserProfile, ServiceType } from "./types";

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
  
  // MANDATORY LEGAL CHECK (v1.2)
  const CURRENT_TERMS_V = 'v1.2';
  if (!profile.termsAccepted || profile.termsVersion !== CURRENT_TERMS_V) {
      return { isEligible: false, reason: "Debés aceptar los nuevos Términos y Condiciones", code: "TERMS_NOT_ACCEPTED" };
  }
  
  // Strict validations
  if (!profile.name || profile.name.trim() === "" || profile.name.includes("@")) {
    return { isEligible: false, reason: "Debés colocar tu nombre real", code: "MISSING_NAME" };
  }
  if (!profile.phone || profile.phone.trim() === "") {
    return { isEligible: false, reason: "Debés agregar un teléfono a tu perfil", code: "MISSING_PHONE" };
  }
  
  // Trust either the Auth token (isEmailVerified) OR the Firestore profile.
  // This allows users who just verified their email to proceed even if their token is stale.
  const verified = (isEmailVerified === true) || (profile.emailVerified === true);
  if (!verified) {
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
  // El ÚNICO estado que habilita operación es "active".
  // "municipal_approved" es estado INTERMEDIO — NO habilita operación.
  if (profile.driverSubtype === 'express') {
    const ms = profile.municipalStatus;
    if (!ms || ms !== 'active') {
      const messages: Partial<Record<string, string>> = {
        pending_municipal_review:    "Pendiente de aprobación municipal. Presentá tu documentación en la municipalidad.",
        municipal_observed:          "Tu habilitación tiene observaciones. Revisá las indicaciones de la municipalidad.",
        municipal_approved:          "Tu habilitación está en proceso. La municipalidad está verificando tu documentación.",
        renewal_under_review:        "Tu renovación de documentos está siendo revisada por la municipalidad.",
        suspended_expired_license:   "Licencia vencida: no podés operar hasta que la municipalidad apruebe la renovación.",
        suspended_expired_insurance: "Seguro vencido: no podés operar hasta que la municipalidad apruebe la renovación.",
        suspended_unpaid_canon:      "Canon municipal impago: regularizá el pago en tu municipalidad para volver a operar.",
        suspended_by_municipality:   "Tu habilitación fue suspendida por la municipalidad. Contactalos para más información.",
        rejected_by_municipality:    "Tu solicitud de habilitación fue rechazada por la municipalidad.",
      };
      const reason = messages[ms ?? ''] ?? "Habilitación municipal requerida para operar.";
      return { isEligible: false, reason, code: "MUNICIPAL_BLOCKED" };
    }
  }

  if (!profile.approved) return { isEligible: false, reason: "Tu cuenta está pendiente de aprobación", code: "NOT_APPROVED" };
  if (!profile.profileCompleted) return { isEligible: false, reason: "Debés completar tu perfil", code: "PROFILE_INCOMPLETE" };

  // MANDATORY LEGAL CHECK (v1.2)
  const CURRENT_TERMS_V = 'v1.2';
  if (!profile.termsAccepted || profile.termsVersion !== CURRENT_TERMS_V) {
      return { isEligible: false, reason: "Debés aceptar los nuevos Términos y Condiciones", code: "TERMS_NOT_ACCEPTED" };
  }

  if (!profile.phone || profile.phone.trim() === "") {
    return { isEligible: false, reason: "Debés agregar un teléfono a tu perfil", code: "MISSING_PHONE" };
  }

  // Trust either source
  const verified = (isEmailVerified === true) || (profile.emailVerified === true);
  if (!verified) {
    return { isEligible: false, reason: "Debés verificar tu cuenta de email", code: "UNVERIFIED_EMAIL" };
  }

  const balance = profile.currentBalance ?? 0;
  if (balance < MIN_BALANCE_ARS) {
    return { isEligible: false, reason: "Tu saldo en billetera VamO es negativo. Recargá para seguir recibiendo viajes.", code: "LOW_BALANCE" };
  }

  return { isEligible: true };
};


export const canDriverTakeRide = (driverProfile: UserProfile, rideService: ServiceType): boolean => {
    return canDriverReceiveOffers(driverProfile, rideService).isEligible;
}

export const canDriverReceiveOffers = (
    profile: UserProfile | null | undefined, 
    rideService?: ServiceType, 
    isEmailVerified?: boolean,
    rideMeta?: { isDiscountApplied?: boolean; hasPet?: boolean }
): EligibilityResult => {
  // First, check basic online eligibility
  const basicEligibility = canDriverGoOnline(profile, isEmailVerified);
  if (!basicEligibility.isEligible) return basicEligibility;
  
  if (!profile) return { isEligible: false, reason: "Perfil no encontrado", code: "NOT_FOUND" };

  if (profile.activeRideId) return { isEligible: false, reason: "Ya estás en un viaje", code: "ACTIVE_RIDE" };

  if (rideService) {
    const services = profile.servicesOffered || { premium: false, express: false };
    if (rideService === 'premium' && !services.premium) {
        return { isEligible: false, reason: "No ofrecés servicio Premium", code: "SERVICE_MISMATCH" };
    }
    if (rideService === 'express' && !services.express) {
        return { isEligible: false, reason: "No ofrecés servicio Express", code: "SERVICE_MISMATCH" };
    }
    
    // VamO PRO: Driver Preferences
    const prefs = profile.driverPreferences || { acceptsExpress: true, acceptsDiscountedRides: true, acceptsPets: true };
    
    if (rideService === 'express' && !prefs.acceptsExpress) {
        return { isEligible: false, reason: "Preferís no recibir viajes Express", code: "PREFERENCE_MISMATCH" };
    }
    
    if (rideMeta?.isDiscountApplied && !prefs.acceptsDiscountedRides) {
        return { isEligible: false, reason: "Preferís no recibir viajes con descuentos", code: "PREFERENCE_MISMATCH" };
    }
    
    if (rideMeta?.hasPet && !prefs.acceptsPets) {
        return { isEligible: false, reason: "Preferís no recibir mascotas", code: "PREFERENCE_MISMATCH" };
    }
  }

  return { isEligible: true };
};
