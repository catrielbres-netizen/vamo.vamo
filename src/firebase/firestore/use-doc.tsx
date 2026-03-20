'use client';

import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * @fileoverview This hook subscribes to a single Firestore document.
 *
 * @logic
 * 1. It receives a memoized DocumentReference or null.
 * 2. **CRUCIAL**: If the reference is null, the hook immediately sets
 *    isLoading to false and returns, preventing any database operation.
 * 3. When a valid reference is received, it sets up a real-time listener.
 * 4. It handles loading states and both existing and non-existing documents.
 * 5. It includes robust error handling that creates a specific 'GET' permission error.
 */
    
/** Utility type to add an 'id' field to a given type T. */
type WithId<T> = T & { id: string };

/**
 * Interface for the state managed by the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

const initialState = {
    data: null,
    isLoading: true,
    error: null,
};

/**
 * React hook to subscribe to a single Firestore document in real-time.
 * Handles nullable references and ensures atomic state updates.
 * 
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedDocRef or BAD THINGS WILL HAPPEN.
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {DocumentReference<DocumentData> | null | undefined} memoizedDocRef -
 * The Firestore DocumentReference. Waits if null/undefined.
 * @returns {UseDocResult<T>} Object with data, isLoading, error.
 */
export function useDoc<T = any>(
  memoizedDocRef: DocumentReference<DocumentData> | null | undefined,
): UseDocResult<T> {
  const [state, setState] = useState<UseDocResult<T>>(initialState);

  useEffect(() => {
    // This is the main guard. If the ref is null, we do nothing.
    if (!memoizedDocRef) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    // Reset state to loading when the document reference changes
    setState({ data: null, isLoading: true, error: null });

    const unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setState({
            data: { ...(snapshot.data() as T), id: snapshot.id },
            isLoading: false,
            error: null,
          });
        } else {
          // Document does not exist, which is a valid success state.
          setState({ data: null, isLoading: false, error: null });
        }
      },
      (error: FirestoreError) => {
        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: memoizedDocRef.path,
        });

        setState({ data: null, isLoading: false, error: contextualError });
      }
    );

    return () => unsubscribe();
  }, [memoizedDocRef]);

  return state;
}
