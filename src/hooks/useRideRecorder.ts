import { useState, useRef, useEffect, useCallback } from 'react';
import { useFirestore, useStorage } from '@/firebase';
import { doc, updateDoc, serverTimestamp, collection, addDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { RecordingType, RideRecording } from '@/lib/types';

/**
 * [VamO PRO] RIDE RECORDER HOOK
 * Handles Audio/Video recording with local persistence (IndexedDB)
 * and synchronization with Firestore for notifications.
 */

const DB_NAME = 'vamo_safety';
const STORE_NAME = 'recordings';

async function openDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveLocalRecording(id: string, blob: Blob, metadata: any) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
        const req = store.put({ id, blob, metadata, timestamp: Date.now() });
        req.onsuccess = resolve;
        req.onerror = reject;
    });
}

async function getLocalRecording(id: string) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise<any>((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

export function useRideRecorder(rideId: string, userId: string, role: 'driver' | 'passenger', cityKey: string) {
    const db = useFirestore();
    const storage = useStorage();

    const [isRecording, setIsRecording] = useState(false);
    const [recordingType, setRecordingType] = useState<RecordingType | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [recordingId, setRecordingId] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    const stopRecording = useCallback(async (shouldUpload = false) => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

        console.log('[RECORDER] Stopping recording...');
        mediaRecorderRef.current.stop();
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        // Update Firestore status
        try {
            const rideRef = doc(db, 'rides', rideId);
            const statusUpdate: any = {
                'recordingStatus.lastUpdateAt': serverTimestamp(),
            };
            if (role === 'passenger') {
                statusUpdate['recordingStatus.isRecordingByPassenger'] = false;
            } else {
                statusUpdate['recordingStatus.isRecordingByDriver'] = false;
            }
            await updateDoc(rideRef, statusUpdate);
        } catch (err) {
            console.error('[RECORDER] Error updating Firestore on stop:', err);
        }

        setIsRecording(false);
        setRecordingType(null);

        if (shouldUpload && recordingId) {
            // Logic for auto-upload if needed (e.g. panic)
            // This is handled by a separate function
        }
    }, [rideId, role, recordingId]);

    const startRecording = useCallback(async (type: RecordingType) => {
        if (isRecording) {
            console.warn('[RECORDER] Already recording');
            return;
        }

        setError(null);
        const newId = `rec_${rideId}_${userId}_${Date.now()}`;
        setRecordingId(newId);

        try {
            console.log(`[RECORDER] Requesting permissions for ${type}...`);
            const constraints: MediaStreamConstraints = {
                audio: true,
                video: type !== 'audio' ? { facingMode: 'user' } : false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            const options = { mimeType: type === 'audio' ? 'audio/webm' : 'video/webm;codecs=vp8,opus' };
            const recorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: options.mimeType });
                console.log(`[RECORDER] Recording finished. Blob size: ${blob.size} bytes`);
                
                // Save locally first (IndexedDB)
                await saveLocalRecording(newId, blob, { rideId, userId, role, type });

                // Create initial Firestore record
                const recRef = doc(db, 'ride_recordings', newId);
                await setDoc(recRef, {
                    id: newId,
                    rideId,
                    userId,
                    role,
                    cityKey,
                    type,
                    status: 'local_ready',
                    encryptionStatus: 'none',
                    startedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                });
            };

            // Start recording
            recorder.start(1000); // Collect data every second
            setIsRecording(true);
            setRecordingType(type);

            // Update Firestore status for notifications
            const rideRef = doc(db, 'rides', rideId);
            const statusUpdate: any = {
                'recordingStatus.lastUpdateAt': serverTimestamp(),
            };
            if (role === 'passenger') {
                statusUpdate['recordingStatus.isRecordingByPassenger'] = true;
                statusUpdate['recordingStatus.passengerRecordingType'] = type;
            } else {
                statusUpdate['recordingStatus.isRecordingByDriver'] = true;
                statusUpdate['recordingStatus.driverRecordingType'] = type;
            }
            await updateDoc(rideRef, statusUpdate);

        } catch (err: any) {
            console.error('[RECORDER] Permission denied or device not found:', err);
            setError(err.name === 'NotAllowedError' ? 'Permiso de cámara/micrófono denegado' : 'Error al iniciar grabación');
            setIsRecording(false);
            setRecordingType(null);
        }
    }, [rideId, userId, role, cityKey, isRecording]);

    const uploadRecording = useCallback(async (id: string, panicId?: string) => {
        try {
            const localData = await getLocalRecording(id);
            if (!localData) throw new Error('Recording not found locally');

            const recRef = doc(db, 'ride_recordings', id);
            await updateDoc(recRef, { status: 'uploading' });

            const storagePath = `safety_recordings/${rideId}/${id}.webm`;
            const fileRef = ref(storage, storagePath);
            
            await uploadBytes(fileRef, localData.blob);
            const downloadUrl = await getDownloadURL(fileRef);

            await updateDoc(recRef, {
                status: 'uploaded',
                storagePath,
                downloadUrl,
                endedAt: serverTimestamp(),
                durationSeconds: Math.floor(localData.blob.size / 1024), // Rough estimate or use metadata
                linkedPanicAlertId: panicId || null
            });

            console.log('[RECORDER] Upload successful:', downloadUrl);
            return downloadUrl;
        } catch (err) {
            console.error('[RECORDER] Upload failed:', err);
            const recRef = doc(db, 'ride_recordings', id);
            await updateDoc(recRef, { status: 'failed' });
            throw err;
        }
    }, [rideId]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return {
        isRecording,
        recordingType,
        recordingId,
        error,
        startRecording,
        stopRecording,
        uploadRecording
    };
}
