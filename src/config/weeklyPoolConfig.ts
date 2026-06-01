export const weeklyPoolConfig = {
    initialPoolAmount: 20000,
    contributionPerCompletedTrip: 100,
    maxDisplayedGoal: 600000,
    eligibleTopCount: 10,
    individualCapPercentage: 0.25, // 25% max per driver
    multipliersByRank: [
        { min: 1, max: 2, multiplier: 1.5 },
        { min: 3, max: 6, multiplier: 1.2 },
        { min: 7, max: 10, multiplier: 1.0 }
    ]
};

/**
 * Helper to get the multiplier for a given rank based on config.
 */
export function getMultiplierForRank(rank: number): number {
    const config = weeklyPoolConfig.multipliersByRank.find(c => rank >= c.min && rank <= c.max);
    return config ? config.multiplier : 0;
}
