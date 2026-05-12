import { getDb } from "./firebaseAdmin";
import { PassengerLifecycle, PassengerRiskSummary } from "../types";

/**
 * [VamO PRO] Get Passenger Risk Summary
 * Fetches the lifecycle data and returns a driver-friendly summary.
 */
export async function getPassengerRiskSummary(passengerId: string): Promise<PassengerRiskSummary> {
    const db = getDb();
    try {
        const lifecycleSnap = await db.collection('passenger_lifecycle').doc(passengerId).get();
        
        if (!lifecycleSnap.exists) {
            return {
                totalMarks: 0,
                trustScore: 100,
                warningText: "Nuevo Pasajero"
            };
        }

        const data = lifecycleSnap.data() as PassengerLifecycle;
        const trustScore = data.trustScore ?? 100;
        
        let warningText = "";
        if (trustScore < 50) {
            warningText = "Precaución: Puntaje Bajo";
        } else if (data.totalDriverMarks > 0) {
            warningText = `Reportado ${data.totalDriverMarks} veces`;
        } else {
            warningText = "Pasajero Confiable";
        }

        return {
            totalMarks: data.totalDriverMarks || 0,
            lastMarkType: data.lastDriverMarkType,
            trustScore,
            warningText
        };
    } catch (error) {
        console.error(`[RISK_SUMMARY_ERROR] For ${passengerId}:`, error);
        return {
            totalMarks: 0,
            trustScore: 100,
            warningText: "Error al verificar perfil"
        };
    }
}
