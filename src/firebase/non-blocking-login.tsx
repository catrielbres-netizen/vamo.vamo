
'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { Firestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';


/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance);
}

/** Initiate email/password sign-up (non-blocking). */
export async function initiateEmailSignUp(authInstance: Auth, firestore: Firestore, email: string, password: string): Promise<void> {
  try {
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    const user = userCredential.user;

    const userProfileRef = doc(firestore, 'users', user.uid);
    
    const newUserProfile: Partial<UserProfile> = {
        name: email.split('@')[0],
        email: email,
        role: 'passenger',
        profileCompleted: false, // Passengers now need to complete their profile
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        vamoPoints: 0,
        ridesCompleted: 0,
        activeBonus: false,
    };

    await setDoc(userProfileRef, newUserProfile);

  } catch (error) {
    console.error("Error during sign up and profile creation:", error);
    throw error;
  }
}

/** Initiate email/password sign-up for a DRIVER (non-blocking). */
export async function initiateDriverEmailSignUp(authInstance: Auth, firestore: Firestore, email: string, password: string): Promise<void> {
  try {
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    const user = userCredential.user;

    const userProfileRef = doc(firestore, 'users', user.uid);
    
    const newDriverProfile: Partial<UserProfile> = {
        name: email.split('@')[0],
        email: email,
        role: 'driver',
        profileCompleted: false, // Drivers need to complete their profile
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Driver specific fields
        approved: false,
        driverStatus: 'inactive',
        averageRating: null,
        ridesCompleted: 0,
        vehicleVerificationStatus: 'unverified',
    };

    await setDoc(userProfileRef, newDriverProfile);

  } catch (error) {
    console.error("Error during driver sign up and profile creation:", error);
    throw error;
  }
}
