export const passengerWeeklyPoolConfig = {
    initialPoolAmount: 20000,
    contributionPerCompletedTrip: 100,
    maxDisplayedGoal: 600000,
    eligibleTopCount: 20,
    individualCapPercentage: 0.20, // 20% max per passenger
    multipliersByRank: [
        { min: 1, max: 3, multiplier: 1.5 },
        { min: 4, max: 10, multiplier: 1.2 },
        { min: 11, max: 20, multiplier: 1.0 }
    ]
};

/**
 * Helper to get the multiplier for a given rank based on passenger config.
 */
export function getPassengerMultiplierForRank(rank: number): number {
    const config = passengerWeeklyPoolConfig.multipliersByRank.find(c => rank >= c.min && rank <= c.max);
    return config ? config.multiplier : 0;
}
