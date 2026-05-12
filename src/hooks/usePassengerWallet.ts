
import { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { collection, query, where, onSnapshot, Timestamp, doc } from 'firebase/firestore';

export interface PassengerCredit {
    id: string;
    amount: number;
    source: string;
    expiresAt: Timestamp;
    status: string;
}

export function usePassengerWallet() {
    const { user } = useUser();
    const firestore = useFirestore();
    const [credits, setCredits] = useState<PassengerCredit[]>([]);
    const [wallet, setWallet] = useState<{cashBalance: number, promoBalance: number} | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore || !user) return;

        // 1. Credits Listener
        const q = query(
            collection(firestore, 'passenger_credits'),
            where('userId', '==', user.uid),
            where('status', '==', 'active'),
            where('expiresAt', '>', Timestamp.now())
        );

        const unsubCredits = onSnapshot(q, (snapshot) => {
            const creditsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as PassengerCredit));
            creditsData.sort((a, b) => a.expiresAt.toMillis() - b.expiresAt.toMillis());
            setCredits(creditsData);
            if (wallet !== null) setIsLoading(false);
        });

        // 2. Wallet Listener (VamO Pay cash & promo)
        const walletRef = doc(firestore, 'wallets', user.uid);
        const unsubWallet = onSnapshot(walletRef, (snap) => {
            if (snap.exists()) {
                setWallet(snap.data() as any);
            } else {
                setWallet({ cashBalance: 0, promoBalance: 0 });
            }
            setIsLoading(false);
        });

        return () => {
            unsubCredits();
            unsubWallet();
        };
    }, [firestore, user]);

    const totalBalance = useMemo(() => {
        const creditsTotal = credits.reduce((acc, credit) => acc + credit.amount, 0);
        const walletTotal = (wallet?.cashBalance || 0) + (wallet?.promoBalance || 0);
        return creditsTotal + walletTotal;
    }, [credits, wallet]);

    const nextExpiration = useMemo(() => {
        if (credits.length === 0) return null;
        return credits[0].expiresAt;
    }, [credits]);

    return { 
        credits, 
        totalBalance, 
        wallet,
        nextExpiration, 
        isLoading: isLoading || (!!user && wallet === null)
    };
}
