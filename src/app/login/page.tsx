'use client';

import React from 'react';
import LoginPageClient from './LoginPageClient';

/**
 * [VamO REVERSION] Volviendo al flujo unificado y estable.
 * Se eliminan los portales separados por URL para evitar fragmentación.
 */
export default function RootLoginPage() {
    return <LoginPageClient />;
}
