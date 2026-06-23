export const weeklyPoolConfig = {
    initialPoolAmount: 20000,
    contributionPerCompletedTrip: 100,
    maxDisplayedGoal: 600000,
    eligibleTopCount: 50,
    individualCapPercentage: 0.10, // 10% max per driver given the wider distribution
    multipliersByRank: [
        { min: 1, max: 5, multiplier: 1.5 },
        { min: 6, max: 20, multiplier: 1.2 },
        { min: 21, max: 50, multiplier: 1.0 }
    ]
};

/**
 * Helper to get the multiplier for a given rank based on config.
 */
export function getMultiplierForRank(rank: number): number {
    const config = weeklyPoolConfig.multipliersByRank.find(c => rank >= c.min && rank <= c.max);
    return config ? config.multiplier : 0;
}
