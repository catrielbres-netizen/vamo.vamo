export type ReputationLevel = 'Excelente' | 'Bueno' | 'En observación' | 'Suspendido';

export const getReputationLevel = (score: number): ReputationLevel => {
    if (score >= 90) return 'Excelente';
    if (score >= 70) return 'Bueno';
    if (score >= 40) return 'En observación';
    return 'Suspendido';
};

export const clampScore = (score: number): number => {
    return Math.max(0, Math.min(100, score));
};

export const DRIVER_SCORE_RULES = {
    RIDE_COMPLETED: 1,
    THUMBS_UP: 2,
    LATE_CANCELLATION: -10,
    NO_SHOW: -25,
    COMPLAINT_MILD: -5,
    COMPLAINT_MODERATE: -10,
    COMPLAINT_SEVERE: -100
};

export const PASSENGER_SCORE_RULES = {
    THUMBS_UP: 1,
    LATE_CANCELLATION: -5,
    NO_SHOW: -20,
    VALIDATED_COMPLAINT: -10,
    FRAUD_SEVERE: -100
};

/**
 * Calculates the new score after an event.
 */
export const calculateNewScore = (currentScore: number, pointChange: number): number => {
    return clampScore(currentScore + pointChange);
};
