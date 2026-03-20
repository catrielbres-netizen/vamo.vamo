'use client';

import { useMemo, type DependencyList } from 'react';

type MemoFirebase <T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T | null, deps: DependencyList): MemoFirebase<T> | null {
  const memoized = useMemo(factory, deps);
  
  // If the factory returns null, or a non-object, we return null, 
  // as we can't tag it. Firestore refs/queries are always objects.
  if (typeof memoized !== 'object' || memoized === null) {
    return null;
  }
  
  // Tag the object to signify it's memoized and return it.
  (memoized as MemoFirebase<T>).__memo = true;
  return memoized as MemoFirebase<T>;
}
