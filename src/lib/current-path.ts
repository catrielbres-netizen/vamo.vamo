// @/lib/current-path.ts
// A simple, non-React module to hold the global current path.
// This is used to break out of stale React closures in external listeners like Firebase `onMessage`.

export const pathStore = {
  current: '/',
};
