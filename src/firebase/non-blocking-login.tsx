
'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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

    // After creating the user, create their profile in Firestore with the 'passenger' role.
    const userProfileRef = doc(firestore, 'users', user.uid);
    
    // Explicitly type the new profile
    const newUserProfile: Partial<UserProfile> = {
        name: email.split('@')[0], // Default name from email
        email: email,
        role: 'passenger',
        profileCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        vamoPoints: 0,
        ridesCompleted: 0,
        activeBonus: false,
    };

    // Use setDoc to create the document. Use a non-blocking version if available,
    // but for this critical step, a blocking call is acceptable.
    await setDoc(userProfileRef, newUserProfile);

  } catch (error) {
    console.error("Error during sign up and profile creation:", error);
    // Re-throw the error so the calling component can handle it (e.g., show a toast)
    throw error;
  }
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password);
}
