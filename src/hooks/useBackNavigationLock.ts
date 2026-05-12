'use client';

import { useEffect } from 'react';

/**
 * Hook to prevent the user from navigating back using the browser buttons.
 * Useful for locking the UI during critical flows like active rides.
 * @param lock Whether the lock is active.
 */
export function useBackNavigationLock(lock: boolean) {
  useEffect(() => {
    if (!lock) return;

    // Use a hash fragment to intercept the back button without affecting history too much
    // Or just push the current state again
    const handlePopState = (event: PopStateEvent) => {
      if (lock) {
        // Push current state back to history to "neutralize" the back action
        window.history.pushState(null, '', window.location.href);
      }
    };

    // Initial push to have something to "pop" from
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [lock]);
}
