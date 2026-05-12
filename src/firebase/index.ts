// This file is the single entry point for all Firebase-related functionality.

// --- 1. BARREL EXPORTS ---
// Re-exporting all hooks and providers for easy access throughout the app.

export * from './provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './errors';
export * from './error-emitter';

// Explicitly export useUser but not its re-exports from provider
export { useUser } from './auth/use-user';
export type { UseUserResult } from './auth/use-user';

/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
export * from './config';

export * from './hooks';
