// This file is the single entry point for all Firebase-related functionality.

// --- 1. BARREL EXPORTS ---
// Re-exporting all hooks and providers for easy access throughout the app.

export * from './provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './errors';
export * from './error-emitter';
export * from './auth/use-user';
export * from './hooks';
