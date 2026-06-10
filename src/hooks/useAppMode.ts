import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { AppModeConfig, FinancialModelConfig } from '@/lib/types';

const defaultAppMode: AppModeConfig = {
    mode: 'municipal',
    municipalEnabled: true,
    trafficPanelEnabled: true,
    stopsPanelEnabled: true,
    independentModeEnabled: false,
    versionLabel: 'Modo Institucional Municipal',
};

const defaultFinancialMode: FinancialModelConfig = {
    mode: 'independent',
    municipalFeeEnabled: false,
    municipalSharePercent: 0,
    vamoCommissionPercent: 0.15,
    label: 'Versión Independiente'
};

export function useAppMode() {
    const firestore = useFirestore();
    const [appMode, setAppMode] = useState<AppModeConfig>(defaultAppMode);
    const [financialMode, setFinancialMode] = useState<FinancialModelConfig>(defaultFinancialMode);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;

        // Listen to app_mode
        const appModeUnsubscribe = onSnapshot(
            doc(firestore, 'system_config', 'app_mode'),
            (snap) => {
                if (snap.exists()) {
                    setAppMode(snap.data() as AppModeConfig);
                } else {
                    setAppMode(defaultAppMode);
                }
            },
            (err) => {
                console.error("Error reading app_mode:", err);
            }
        );

        // Listen to financial_model
        const financialModeUnsubscribe = onSnapshot(
            doc(firestore, 'system_config', 'financial_model'),
            (snap) => {
                if (snap.exists()) {
                    setFinancialMode(snap.data() as FinancialModelConfig);
                } else {
                    setFinancialMode(defaultFinancialMode);
                }
                setLoading(false);
            },
            (err) => {
                console.error("Error reading financial_model:", err);
                setLoading(false);
            }
        );

        return () => {
            appModeUnsubscribe();
            financialModeUnsubscribe();
        };
    }, [firestore]);

    return { appMode, financialMode, loading };
}
