'use client';

import { useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DEMO_USERS = {
  passenger: {
    uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
    email: 'demo_passenger@vamo.com',
    password: '123456',
    data: {
      uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
      email: 'demo_passenger@vamo.com',
      name: 'Pasajero Demo',
      role: 'passenger',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      phone: '+542804000000',
      activeRideId: null,
      currentBalance: 0,
      serviceTier: 'premium',
      city: 'Rawson',
      passengerProgress: { level: 2, monthlyRides: 8 },
      welcomeBonus: { available: true, used: false },
      referralCode: 'VAMOFRIEND',
    }
  },
  driver: {
    uid: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
    email: 'demo_driver@vamo.com',
    password: '123456',
    data: {
      uid: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
      email: 'demo_driver@vamo.com',
      name: 'Chofer Demo',
      role: 'driver',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      phone: '+542804111111',
      currentBalance: 5850,
      driverStatus: 'offline',
      activeRideId: null,
      serviceTier: 'premium',
      servicesOffered: { premium: true, express: true },
      driverMode: 'legal',
      municipalStatus: 'approved',
      canonStatus: 'active',
      vehicleModel: 'Fiat Cronos',
      vehicleColor: 'Blanco',
      plateNumber: 'DEMO-123',
      vehicleVerificationStatus: 'approved',
      city: 'Rawson',
      driverLevel: 'oro',
      referralCode: 'VAMOPRO',
    },
    location: {
      geohash: '69y7j',
      currentLocation: { lat: -43.3002, lng: -65.1023 },
      driverStatus: 'offline',
      approved: true,
      isSuspended: false,
      pendingOffers: 0,
    }
  },
  admin: {
    uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
    email: 'demo_admin@vamo.com',
    password: '123456',
    data: {
      uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
      email: 'demo_admin@vamo.com',
      name: 'Admin Demo',
      role: 'admin',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      city: 'Rawson',
    }
  }
};

export default function DemoSeedPage() {
    const [logs, setLogs] = useState<string[]>([]);
    const [isSeeding, setIsSeeding] = useState(false);

    const log = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

    const runSeed = async () => {
        setIsSeeding(true);
        setLogs([]);
        log("🚀 Starting Enriched Seeding Process...");

        const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        const db = getFirestore(app);
        const auth = getAuth(app);

        const seedProcess = async () => {
            const seedUser = async (userKey: keyof typeof DEMO_USERS) => {
                const user = DEMO_USERS[userKey];
                log(`[${userKey}] Authenticating as ${user.email}...`);
                try {
                    await signInWithEmailAndPassword(auth, user.email, user.password);
                    log(`[${userKey}] Logged in. Setting Firestore data...`);
                    
                    const dataWithTimestamps = {
                        ...user.data,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    };

                    await setDoc(doc(db, 'users', user.uid), dataWithTimestamps, { merge: true });

                    if (userKey === 'driver') {
                        log(`[driver] Setting location and weekly points...`);
                        await setDoc(doc(db, 'drivers_locations', user.uid), {
                            ...(user as any).location,
                            updatedAt: serverTimestamp(),
                            lastSeenAt: serverTimestamp(),
                        }, { merge: true });

                        await setDoc(doc(db, 'driver_points', user.uid), {
                            weeklyPoints: 37,
                            totalPoints: 1250,
                            updatedAt: serverTimestamp(),
                        }, { merge: true });

                        // Seed some mock transactions for history
                        const txs = [
                            { type: 'commission', amount: -150, note: 'Comisión viaje #102', createdAt: serverTimestamp() },
                            { type: 'topup', amount: 2000, note: 'Carga Mercado Pago', createdAt: serverTimestamp() },
                            { type: 'reward', amount: 1000, note: 'Premio Referido', createdAt: serverTimestamp() }
                        ];
                        for (const tx of txs) {
                            await setDoc(doc(db, `users/${user.uid}/transactions`, `tx_${Math.random().toString(36).substr(2, 9)}`), tx);
                        }
                    }
                    log(`✅ [${userKey}] Seeded correctly.`);
                    await signOut(auth);
                } catch (err: any) {
                    log(`❌ [${userKey}] Error: ${err.message}`);
                }
            };

            await seedUser('passenger');
            await seedUser('driver');
            await seedUser('admin');
        };

        await seedProcess();
        log("🏁 Seeding complete.");
        setIsSeeding(false);
    };

    return (
        <main className="p-8 max-w-2xl mx-auto space-y-6">
            <Card className="shadow-2xl border-primary/20">
                <CardHeader className="bg-primary/5 rounded-t-lg border-b border-primary/10">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                        <span>🌱</span> VamO Demo Seeder
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <p className="text-muted-foreground text-sm">
                        This page will log in as each demo user and populate their Firestore documents using the Web SDK.
                        Make sure you have already created the users in <strong>Firebase Auth</strong> with the matching emails/passwords.
                    </p>
                    <Button onClick={runSeed} disabled={isSeeding} className="w-full h-12 text-lg font-bold">
                        {isSeeding ? 'Seeding Database...' : 'SEED DEMO DATA NOW'}
                    </Button>
                    <div className="bg-zinc-950 text-emerald-400 p-4 rounded-lg font-mono text-xs min-h-[350px] max-h-[500px] overflow-y-auto border border-zinc-800 shadow-inner">
                        {logs.map((l, i) => <div key={i} className="py-0.5 border-b border-zinc-900 last:border-0">{l}</div>)}
                        {logs.length === 0 && <div className="text-zinc-700 italic">Console output will appear here...</div>}
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
