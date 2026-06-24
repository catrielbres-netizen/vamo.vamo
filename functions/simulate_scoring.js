// Simulation script for VamO Score

const clampScore = (score) => Math.max(0, Math.min(100, score));
const getLevel = (score) => {
    if (score >= 90) return 'Excelente';
    if (score >= 70) return 'Bueno';
    if (score >= 40) return 'En observación';
    return 'Suspendido';
};

console.log("--- SIMULACIONES VAMO SCORE ---");

// 1. Conductor Excelente
let c1 = 100;
c1 = clampScore(c1 + 1); // Viaje completado (+1)
c1 = clampScore(c1 + 2); // Thumbs up (+2)
console.log(`Conductor 1 (Excelente): Score: ${c1} -> Nivel: ${getLevel(c1)}`);

// 2. Conductor Observación
let c2 = 100;
c2 = clampScore(c2 - 10); // Cancelación tardía
c2 = clampScore(c2 - 10); // Reclamo moderado
c2 = clampScore(c2 - 10); // Cancelación tardía
c2 = clampScore(c2 + 1);  // Viaje
c2 = clampScore(c2 - 25); // No presentarse
console.log(`Conductor 2 (Observación tras varias fallas): Score: ${c2} -> Nivel: ${getLevel(c2)}`);

// 3. Conductor Suspendido
let c3 = 80;
c3 = clampScore(c3 - 100); // Reclamo grave
console.log(`Conductor 3 (Suspendido por reporte grave): Score: ${c3} -> Nivel: ${getLevel(c3)}`);

// 4. Pasajero Suspendido
let p1 = 100;
p1 = clampScore(p1 - 20); // No presentarse
p1 = clampScore(p1 - 20); // No presentarse
p1 = clampScore(p1 - 5);  // Cancelación tardía
p1 = clampScore(p1 - 5);  // Cancelación tardía
p1 = clampScore(p1 - 20); // No presentarse
p1 = clampScore(p1 - 10); // Reclamo validado
console.log(`Pasajero 1 (Suspendido por ausencias y reclamos): Score: ${p1} -> Nivel: ${getLevel(p1)}`);

// 5. Pasajero Fraude
let p2 = 100;
p2 = clampScore(p2 - 100); // Fraude severo
console.log(`Pasajero 2 (Suspendido por fraude): Score: ${p2} -> Nivel: ${getLevel(p2)}`);

console.log("-------------------------------");
