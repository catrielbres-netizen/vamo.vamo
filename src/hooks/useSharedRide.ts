import { useMemo, useEffect, useState, useCallback } from 'react';
import { useDoc, useUser, useFirestore, useFirebaseApp } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { SharedRideRequest, SharedRideGroup } from '@/lib/types';

export function useSharedRide() {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [overrideRequestId, setOverrideRequestId] = useState<string | null>(null);
  const [overrideGroupId, setOverrideGroupId] = useState<string | null>(null);

  const activeRequestId = overrideRequestId || profile?.activeSharedRequestId;

  const requestRef = useMemo(() => 
    firestore && activeRequestId ? doc(firestore, 'shared_ride_requests', activeRequestId) : null
  , [firestore, activeRequestId]);

  const { data: request, loading } = useDoc<SharedRideRequest>(requestRef);

  // Listener del grupo si existe
  const activeGroupId = useMemo(() => {
    return overrideGroupId || request?.groupId || profile?.activeSharedRideGroupId;
  }, [overrideGroupId, request?.groupId, profile?.activeSharedRideGroupId]);

  const groupRef = useMemo(() => {
    return firestore && activeGroupId ? doc(firestore, 'shared_ride_groups', activeGroupId) : null;
  }, [firestore, activeGroupId]);

  const { data: group } = useDoc<SharedRideGroup>(groupRef);

  const cancelRequest = async () => {
    if (!firebaseApp || !activeRequestId) return;
    try {
      setIsCancelling(true);
      const functions = getFunctions(firebaseApp, 'us-central1');
      const cancelSharedRide = httpsCallable(functions, 'cancelSharedRideRequestV1');
      await cancelSharedRide({ requestId: activeRequestId });
      // Reset local overrides
      setOverrideRequestId(null);
      setOverrideGroupId(null);
    } catch (error) {
      console.error("Error cancelling shared ride:", error);
      throw error;
    } finally {
      setIsCancelling(false);
    }
  };

  const confirmPrice = async (price: number) => {
    if (!firebaseApp || !activeRequestId) return;
    try {
      setIsConfirming(true);
      const functions = getFunctions(firebaseApp, 'us-central1');
      const confirmSharedRide = httpsCallable(functions, 'confirmSharedRidePriceV1');
      await confirmSharedRide({ requestId: activeRequestId, confirmedPrice: price });
    } catch (error) {
      console.error("Error confirming shared ride price:", error);
      throw error;
    } finally {
      setIsConfirming(false);
    }
  };

  const listNearbyGroups = useCallback(async (payload: { origin: any; destination: any; cityKey: string }) => {
    if (!firebaseApp) return { groups: [] };
    const functions = getFunctions(firebaseApp, 'us-central1');
    const listNearby = httpsCallable(functions, 'listNearbySharedRideGroupsV1');
    const result = await listNearby(payload);
    return result.data as { groups: any[] };
  }, [firebaseApp]);

  const joinGroup = useCallback(async (payload: { groupId: string; origin: any; destination: any; cityKey: string; individualFareReference: number; sharedRideNoticeAccepted: boolean }) => {
    if (!firebaseApp) return;
    const functions = getFunctions(firebaseApp, 'us-central1');
    const join = httpsCallable(functions, 'joinSharedRideGroupV1');
    const result = await join(payload);
    const data = result.data as any;
    if (data.ok && data.requestId) {
        setOverrideRequestId(data.requestId);
        setOverrideGroupId(data.groupId);
    }
    return data;
  }, [firebaseApp]);

  const requestNewGroup = useCallback(async (payload: { origin: any; destination: any; cityKey: string; individualFareReference: number; sharedRideNoticeAccepted: boolean }) => {
    if (!firebaseApp) return;
    const functions = getFunctions(firebaseApp, 'us-central1');
    const requestShared = httpsCallable(functions, 'requestSharedRideV1');
    const result = await requestShared({ ...payload, manualCreation: true });
    const data = result.data as any;
    if (data.ok && data.requestId) {
        setOverrideRequestId(data.requestId);
        setOverrideGroupId(data.groupId);
    }
    return data;
  }, [firebaseApp]);

  const launchDriverSearch = useCallback(async () => {
    if (!firebaseApp || !request?.groupId) return;
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const launch = httpsCallable(functions, 'launchSharedRideDriverSearchV1');
      await launch({ groupId: request.groupId });
    } catch (error) {
      console.error("Error launching driver search:", error);
    }
  }, [firebaseApp, request?.groupId]);

  return {
    request,
    group,
    loading,
    activeRequestId,
    activeGroupId,
    cancelRequest,
    confirmPrice,
    isCancelling,
    isConfirming,
    listNearbyGroups,
    joinGroup,
    requestNewGroup,
    launchDriverSearch,
    setOverrideRequestId,
    setOverrideGroupId
  };
}
