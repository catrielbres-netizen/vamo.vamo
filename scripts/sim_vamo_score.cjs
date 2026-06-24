const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Mocking scoring.ts logic for simulation without transpilation issues
const ReputationLevel = {
    EXCELENTE: 'Excelente',
    BUENO: 'Bueno',
    OBSERVACION: 'En observación',
    SUSPENDIDO: 'Suspendido'
};

const getReputationLevel = (score) => {
    if (score >= 90) return ReputationLevel.EXCELENTE;
    if (score >= 70) return ReputationLevel.BUENO;
    if (score >= 40) return ReputationLevel.OBSERVACION;
    return ReputationLevel.SUSPENDIDO;
};

const clampScore = (score) => {
    return Math.max(0, Math.min(100, score));
};

const calculateNewScore = (currentScore, pointChange) => {
    return clampScore(currentScore + pointChange);
};

const DRIVER_SCORE_RULES = {
    RIDE_COMPLETED: 1,
    THUMBS_UP: 2,
    LATE_CANCELLATION: -10,
    NO_SHOW: -25,
    COMPLAINT_MILD: -5,
    COMPLAINT_MODERATE: -10,
    COMPLAINT_SEVERE: -100
};

const PASSENGER_SCORE_RULES = {
    THUMBS_UP: 1,
    LATE_CANCELLATION: -5,
    NO_SHOW: -20,
    VALIDATED_COMPLAINT: -10,
    FRAUD_SEVERE: -100
};

async function run() {
    let serviceAccount;
    try {
        serviceAccount = require('../service-account.json');
    } catch (e) {
        console.warn("No service-account.json found. Skipping actual DB write for simulations.");
        serviceAccount = null;
    }

    if (serviceAccount && !admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    const db = serviceAccount ? admin.firestore() : null;

    console.log("=== VamO Score Simulations ===");
    console.log("Base Score for everyone: 100");

    // 1. Conductor Excelente
    let score = 100;
    score = calculateNewScore(score, DRIVER_SCORE_RULES.RIDE_COMPLETED); // +1
    score = calculateNewScore(score, DRIVER_SCORE_RULES.THUMBS_UP); // +2
    let level = getReputationLevel(score);
    console.log(`[Conductor Excelente] Score: ${score}, Nivel: ${level}`);
    if (db) await updateMockUser(db, 'sim_driver_excelente', 'driver', score);

    // 2. Conductor Bueno
    score = 100;
    score = calculateNewScore(score, DRIVER_SCORE_RULES.LATE_CANCELLATION); // -10
    score = calculateNewScore(score, DRIVER_SCORE_RULES.COMPLAINT_MILD); // -5
    level = getReputationLevel(score);
    console.log(`[Conductor Bueno] Score: ${score}, Nivel: ${level}`);
    if (db) await updateMockUser(db, 'sim_driver_bueno', 'driver', score);

    // 3. Conductor en Observacion
    score = 100;
    score = calculateNewScore(score, DRIVER_SCORE_RULES.NO_SHOW); // -25
    score = calculateNewScore(score, DRIVER_SCORE_RULES.LATE_CANCELLATION); // -10
    score = calculateNewScore(score, DRIVER_SCORE_RULES.COMPLAINT_MILD); // -5
    level = getReputationLevel(score);
    console.log(`[Conductor en Observación] Score: ${score}, Nivel: ${level}`);
    if (db) await updateMockUser(db, 'sim_driver_observacion', 'driver', score);

    // 4. Conductor Suspendido
    score = 100;
    score = calculateNewScore(score, DRIVER_SCORE_RULES.COMPLAINT_SEVERE); // -100
    level = getReputationLevel(score);
    console.log(`[Conductor Suspendido] Score: ${score}, Nivel: ${level}`);
    if (db) await updateMockUser(db, 'sim_driver_suspendido', 'driver', score);

    // 5. Pasajero Suspendido
    score = 100;
    score = calculateNewScore(score, PASSENGER_SCORE_RULES.FRAUD_SEVERE); // -100
    level = getReputationLevel(score);
    console.log(`[Pasajero Suspendido] Score: ${score}, Nivel: ${level}`);
    if (db) await updateMockUser(db, 'sim_passenger_suspendido', 'passenger', score);
    
    // Bounds Test
    let boundsScore = 100;
    boundsScore = calculateNewScore(boundsScore, 50); // Try to exceed 100
    console.log(`[Test Bounds] Max Score: ${boundsScore} (Expected 100)`);
    boundsScore = calculateNewScore(0, -50); // Try to go below 0
    console.log(`[Test Bounds] Min Score: ${boundsScore} (Expected 0)`);
    
    console.log("=== End Simulations ===");
}

async function updateMockUser(db, uid, role, score) {
    const isSuspended = getReputationLevel(score) === 'Suspendido';
    await db.collection('users').doc(uid).set({
        uid,
        role,
        vamoScore: score,
        isSuspended,
        name: uid,
        email: `${uid}@test.com`
    }, { merge: true });
}

run().catch(console.error);
