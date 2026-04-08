import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { WAITING_PER_MIN } from '@/lib/pricing';

export function useWaitTimer(ride: Ride | null | undefined) {
    const [waitMinutes, setWaitMinutes] = useState('00:00');
    const [waitCost, setWaitCost] = useState(0);

    const isCurrentlyWaiting = Boolean(ride && ((ride as any).isWaitingForPassenger === true || ride.status === 'paused'));
    
    // Accumulate total completed wait periods
    const historicalWaitingSeconds = (ride as any)?.cumulativeWaitSeconds ?? (ride?.pauseHistory || []).reduce((acc: number, p: any) => acc + (p.duration || 0), 0);
    
    const hasWaitData = historicalWaitingSeconds > 0 || isCurrentlyWaiting;

    useEffect(() => {
        if (!ride) return;

        let intervalId: any = null;

        const updateWaitState = (totalSeconds: number) => {
            const totalMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
            const remainingSeconds = Math.floor(Math.max(0, totalSeconds) % 60);
            setWaitMinutes(`${String(totalMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`);
            
            // Bloque 3: 300 seconds (5 minutes) grace period before charging
            const GRACE_PERIOD_SECONDS = 300;
            let costOfWait = 0;
            if (totalSeconds > GRACE_PERIOD_SECONDS) {
                const billableSeconds = totalSeconds - GRACE_PERIOD_SECONDS;
                // Charge per started minute (Math.ceil)
                costOfWait = Math.ceil(billableSeconds / 60) * WAITING_PER_MIN;
            }
            setWaitCost(costOfWait);
        };

        if (isCurrentlyWaiting) {
            const startTimeStamp = (ride as any).isWaitingForPassenger ? (ride as any).passengerWaitStartedAt : (ride.status === 'paused' ? (ride as any).pauseStartedAt : null);
            
            if (startTimeStamp instanceof Timestamp) {
                const startTime = startTimeStamp.toDate();
                
                intervalId = setInterval(() => {
                    const now = new Date();
                    const currentOngoingSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
                    updateWaitState(historicalWaitingSeconds + Math.max(0, currentOngoingSeconds));
                }, 1000);
                
                // Initial tick
                const initialCurrentSeconds = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
                updateWaitState(historicalWaitingSeconds + Math.max(0, initialCurrentSeconds));
            } else {
                updateWaitState(historicalWaitingSeconds);
            }
        } else {
            updateWaitState(historicalWaitingSeconds);
        }
        
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [
        ride?.status, 
        (ride as any)?.isWaitingForPassenger, 
        (ride as any)?.passengerWaitStartedAt, 
        (ride as any)?.pauseStartedAt, 
        ride?.pauseHistory,
        (ride as any)?.cumulativeWaitSeconds,
        historicalWaitingSeconds,
        isCurrentlyWaiting
    ]);

    return {
        waitMinutes,
        waitCost,
        isCurrentlyWaiting,
        hasWaitData,
        historicalWaitingSeconds
    };
}
