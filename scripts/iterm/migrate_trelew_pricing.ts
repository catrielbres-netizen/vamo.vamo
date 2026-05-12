
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// This script should be run in the cloud or with proper permissions
const db = getFirestore();

async function migrateTrelew() {
  const rawsonSnap = await db.doc('municipal_pricing/rawson').get();
  if (!rawsonSnap.exists) {
    console.error('Rawson pricing not found to use as base');
    return;
  }

  const rawsonData = rawsonSnap.data();
  const factor = 1.20; // 20% more

  const trelewPricing = {
    ...rawsonData,
    DAY_BASE_FARE: Math.round((rawsonData?.DAY_BASE_FARE || 0) * factor),
    DAY_PRICE_PER_100M: Math.round((rawsonData?.DAY_PRICE_PER_100M || 0) * factor),
    DAY_WAITING_PER_MIN: Math.round((rawsonData?.DAY_WAITING_PER_MIN || 0) * factor),
    NIGHT_BASE_FARE: Math.round((rawsonData?.NIGHT_BASE_FARE || 0) * factor),
    NIGHT_PRICE_PER_100M: Math.round((rawsonData?.NIGHT_PRICE_PER_100M || 0) * factor),
    NIGHT_WAITING_PER_MIN: Math.round((rawsonData?.NIGHT_WAITING_PER_MIN || 0) * factor),
    MINIMUM_FARE: Math.round((rawsonData?.MINIMUM_FARE || 0) * factor),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.doc('municipal_pricing/trelew').set(trelewPricing);
  console.log('✅ Trelew pricing created (+20% vs Rawson)');
}

migrateTrelew();
