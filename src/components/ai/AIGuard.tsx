'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useFirebase } from '@/firebase/provider';
import { VamoAIAssistant } from './VamoAIAssistant';

// Rutas donde la IA NO debe aparecer nunca
const EXCLUDED_PATHS = [
    '/login',
    '/registro',
    '/registro/pasajero',
    '/registro/conductor',
    '/municipal/login',
    '/traffic/login',
    '/driver/login',
];

/**
 * [VamO AI] AI Guard
 * Solo muestra el asistente si el usuario está autenticado
 * y no está en una ruta pública (login, registro).
 */
export function AIGuard() {
    const { user, isInitializing } = useFirebase();
    const pathname = usePathname();

    // Feature flag — controlado por variable de entorno en build time
    const isAiEnabled = process.env.NEXT_PUBLIC_VAMO_AI_ENABLED === 'true';

    // 1. Flag apagado → no mostrar
    if (!isAiEnabled) return null;

    // 2. Si auth aún está cargando → no mostrar
    if (isInitializing) return null;

    // 3. Si no hay usuario autenticado → no mostrar
    if (!user) return null;

    // 4. Si la ruta está excluida (login, registro) → no mostrar
    if (EXCLUDED_PATHS.some(p => pathname?.startsWith(p))) return null;

    return <VamoAIAssistant />;
}
