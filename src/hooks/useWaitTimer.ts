import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { WAITING_PER_MIN } from '@/lib/pricing';

export function useWaitTimer(ride: Ride | null | undefined) {
    const [waitMinutes, setWaitMinutes] = useState('00:00');
    const [waitCost, setWaitCost] = useState(0);

    const isPaused = ride?.status === 'paused';
    const isArrivedWaiting = ride?.status === 'driver_arrived';
    const isCurrentlyWaiting = isPaused || isArrivedWaiting;
    
    // [VamO PRO] Centralized Grace Period Logic
    const GRACE_PERIOD_SECONDS = 300; // 5 minutes

    // Calculate total historical duration (for display and grace period calculation)
    const historicalTotalSeconds = (ride as any)?.cumulativeWaitSeconds || (ride?.pauseHistory || []).reduce((acc: number, p: any) => acc + (p.duration || 0), 0);
    
    const hasWaitData = historicalTotalSeconds > 0 || isCurrentlyWaiting;

    useEffect(() => {
        if (!ride) return;

        let intervalId: any = null;

        const updateWaitState = (currentTotalSeconds: number, currentBillableSeconds: number) => {
            const totalMinutes = Math.floor(Math.max(0, currentTotalSeconds) / 60);
            const remainingSeconds = Math.floor(Math.max(0, currentTotalSeconds) % 60);
            setWaitMinutes(`${String(totalMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`);
            
            // Pro-rated calculation to match backend settlement
            const costOfWait = (currentBillableSeconds / 60) * WAITING_PER_MIN;
            setWaitCost(costOfWait);
        };

        if (isCurrentlyWaiting) {
            let startTimeStamp = isArrivedWaiting ? ride.arrivedAt : (ride as any).pauseStartedAt;
            
            // [VamO PRO] Reservation Guard: If arrived early, wait starts at scheduledAt
            if (isArrivedWaiting && ride.scheduledAt && ride.arrivedAt) {
                const arrived = (ride.arrivedAt as Timestamp).toDate().getTime();
                const scheduled = (ride.scheduledAt as Timestamp).toDate().getTime();
                if (scheduled > arrived) {
                    startTimeStamp = ride.scheduledAt;
                }
            }
            
            if (startTimeStamp instanceof Timestamp) {
                const startTime = startTimeStamp.toDate();
                
                const tick = () => {
                    const now = new Date();
                    const ongoingSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
                    
                    const currentTotalSeconds = historicalTotalSeconds + Math.max(0, ongoingSeconds);
                    const currentBillableSeconds = Math.max(0, currentTotalSeconds - GRACE_PERIOD_SECONDS);

                    updateWaitState(
                        currentTotalSeconds,
                        currentBillableSeconds
                    );
                };

                intervalId = setInterval(tick, 1000);
                tick(); // Initial tick
            } else {
                const currentBillableSeconds = Math.max(0, historicalTotalSeconds - GRACE_PERIOD_SECONDS);
                updateWaitState(historicalTotalSeconds, currentBillableSeconds);
            }
        } else {
            const currentBillableSeconds = Math.max(0, historicalTotalSeconds - GRACE_PERIOD_SECONDS);
            updateWaitState(historicalTotalSeconds, currentBillableSeconds);
        }
        
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [
        ride?.status, 
        ride?.arrivedAt,
        (ride as any)?.pauseStartedAt, 
        ride?.pauseHistory,
        (ride as any)?.cumulativeWaitSeconds,
        historicalTotalSeconds,
        isCurrentlyWaiting,
        isArrivedWaiting
    ]);

    const isEarlyArrival = isArrivedWaiting && ride?.scheduledAt && ride?.arrivedAt && 
        ((ride.scheduledAt as Timestamp).toDate().getTime() > (ride.arrivedAt as Timestamp).toDate().getTime()) &&
        (new Date().getTime() < (ride.scheduledAt as Timestamp).toDate().getTime());

    return {
        waitMinutes,
        waitCost,
        waitChargeApplied: waitCost, // Renamed for clarity in components
        isCurrentlyWaiting,
        hasWaitData,
        historicalTotalSeconds,
        isEarlyArrival
    };
}
