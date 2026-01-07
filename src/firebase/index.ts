
// This file is now a clean "barrel file" for exporting modules.
// Initialization logic has been moved to client-provider.tsx.

export * from './config';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
export * from './hooks';
