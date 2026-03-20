'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * @fileoverview This hook subscribes to a Firestore collection or query.
 *
 * @logic
 * 1. It receives a memoized Firestore query or null.
 * 2. **CRUCIAL**: If the query is null (e.g., waiting for auth), the hook immediately
 *    sets isLoading to false and returns, preventing any database operation.
 * 3. When a valid query is received, it sets up a real-time listener.
 * 4. It handles the loading state and transforms snapshot data into a usable array.
 * 5. It includes robust error handling that creates a specific 'LIST' permission error.
 */

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the state managed by the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/* Internal implementation of Query:
  https://github.com/firebase/firebase-js-sdk/blob/c5f08a9bc5da0d2b0207802c972d53724ccef055/packages/firestore/src/lite-api/reference.ts#L143
*/
export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    }
  }
}

const initialState = {
    data: null,
    isLoading: true,
    error: null,
};

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Handles nullable references and ensures atomic state updates.
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidance.
 *  
 * @template T Optional type for document data. Defaults to any.
 * @param {CollectionReference<DocumentData> | Query<DocumentData> | null | undefined} memoizedTargetRefOrQuery -
 * The Firestore CollectionReference or Query. Waits if null/undefined.
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
    memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>))  | null | undefined,
): UseCollectionResult<T> {
  const [state, setState] = useState<UseCollectionResult<T>>(initialState);

  useEffect(() => {
    // This is the main guard. If the query is null or undefined,
    // we set the state to not loading and do nothing else.
    if (!memoizedTargetRefOrQuery) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    // Reset state to loading when the query/reference changes
    setState({ data: null, isLoading: true, error: null });

    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: WithId<T>[] = snapshot.docs.map(doc => ({ ...(doc.data() as T), id: doc.id }));
        setState({ data: results, isLoading: false, error: null });
      },
      (error: FirestoreError) => {
        const path: string =
          memoizedTargetRefOrQuery.type === 'collection'
            ? (memoizedTargetRefOrQuery as CollectionReference).path
            : (memoizedTargetRefOrQuery as unknown as InternalQuery)._query.path.canonicalString();

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path,
        });

        setState({ data: null, isLoading: false, error: contextualError });
      }
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]);
  
  return state;
}
