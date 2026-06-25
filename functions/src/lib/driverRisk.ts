import { UserProfile } from "../types";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

/**
 * [VamO PRO] Driver Risk Engine
 * Computes a driver's risk profile based on financial, operational, and security factors.
 */
export function computeDriverRiskProfile(
    driver: UserProfile, 
    wallet?: { cashBalance: number },
    metrics?: { recentCancellations: number, ignoredOffers: number }
) {
    let score = 0;
    const reasons: string[] = [];
    let isHardBlocked = false;

    // A) Financiero
    const balance = wallet?.cashBalance ?? driver.currentBalance ?? 0;
    const negativeLimit = -2000;
    
    if (balance < 0) {
        score += 10;
        reasons.push("Saldo pendiente");
    }
    
    // 80% limit check
    if (balance <= negativeLimit * 0.8) {
        score += 25;
        reasons.push("Cerca del límite de deuda");
    }
    
    // Hard block at limit
    if (balance <= negativeLimit) {
        isHardBlocked = true;
        reasons.push("Límite de deuda alcanzado");
    }

    // B) Operativo
    const cancellations = metrics?.recentCancellations ?? driver.cancellationCount ?? 0;
    if (cancellations >= 3) {
        score += 15;
        reasons.push("Demasiadas cancelaciones recientes");
    }
    
    const ignored = metrics?.ignoredOffers ?? driver.ignoredOffersCount ?? 0;
    if (ignored >= 5) {
        score += 10;
        reasons.push("Muchas ofertas ignoradas");
    }

    if ((driver.watchdogReleaseCount ?? 0) > 0) {
        score += 20;
        reasons.push("Intervenciones del sistema de seguridad");
    }

    // C) Municipal
    if (driver.municipalStatus === 'pending_municipal_review') {
        score += 5;
        reasons.push("Revisión municipal pendiente");
    }
    
    const blockedMuniStatuses = ['rejected', 'rejected_by_municipality', 'suspended', 'suspended_by_municipality'];
    if (blockedMuniStatuses.includes(driver.municipalStatus ?? '')) {
        isHardBlocked = true;
        reasons.push("Restricción municipal activa");
    }
    
    // Future expired docs: +25
    const now = Date.now();
    const weekInMs = 7 * 24 * 60 * 1000;
    
    const checkNearExpiry = (expiry: any) => {
        if (!expiry) return false;
        const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
        const time = d.getTime();
        return time > now && time < (now + weekInMs);
    };

    if (checkNearExpiry(driver.licenseExpiry) || checkNearExpiry(driver.insuranceExpiry) || checkNearExpiry(driver.itvExpiry)) {
        score += 25;
        reasons.push("Documentación próxima a vencer");
    }

    // D) Seguridad
    if ((driver.openPanicClaims ?? 0) > 0) {
        score += 30;
        reasons.push("Reclamo de seguridad abierto");
    }
    
    if ((driver.securityClaimsCount ?? 0) >= 2) {
        score += 20;
        reasons.push("Múltiples reclamos de pasajeros");
    }

    // Level determination
    let level: "low" | "medium" | "high" | "blocked" = "low";
    
    if (isHardBlocked || score >= 86) {
        level = "blocked";
    } else if (score >= 61) {
        level = "high";
    } else if (score >= 31) {
        level = "medium";
    }

    logger.info(`[DRIVER_RISK] uid=${driver.uid} score=${score} level=${level} reasons=${reasons.length}`);

    return {
        driverRiskScore: Math.min(100, score),
        driverRiskLevel: level,
        riskReasons: Array.from(new Set(reasons)),
        lastRiskUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}
