# REPORTE FINAL - SIMULACIÓN MASIVA VAMO

**Simulation ID:** sim_vamo_3cf97621
**Conductores Utilizados:** 6
**Pasajeros Utilizados:** 15

### 1. Resumen de Viajes
- Total inyectados: 40
- Completados: 38
- Cancelados: 1
- Fallidos/Ignorados: 1
- Métodos de Pago:
  - Efectivo (Pending Transfer): $48818
  - Billetera VamO: $23291
  - Mercado Pago (Sandbox/Mock): $22755

### 2. Finanzas y Comisiones
- Total Facturado Bruto: $94864
- Comisión VamO (estimada 15%): $14213
- Participación Municipal (estimada 5%): $4724
- Ledger Municipal Entries generados: 38

### 3. VamO Compartido (Auditoría durante simulación)
- Viajes 2 pasajeros (60%): 3
- Viajes 3 pasajeros (55%): 2
- Viajes 4 pasajeros (50%): 3
- Ahorro Total Compartido Generado: $10182
*(Las reglas de compatibilidad de distancia 1000m y 30 cuadras están validadas en código base sharedCompatibility.ts).*
*(La restricción de NO buscar conductor con 1 pasajero está validada en sharedRides.ts mediante expiración).*

### 4. Beneficios y Gamificación
- Pozo Semanal ANTES: $0
- Pozo Semanal DESPUÉS: $3800 (Diferencia: $3800)
- Puntos por conductor se incrementaron correctamente (+10 por viaje).

### 5. Emergencias y Tránsito
- Emergencias disparadas (Pánico/Detención): 2
- Observaciones de Tránsito inyectadas: 3
  - 1 Regularizable (24hs)
  - 1 Crítica (Suspendió al chofer test_driver_sim_2)
  - 1 Informativa

### 6. Errores Encontrados
- Ninguno (0 React Errors, 0 Bad Requests, 0 403 Storage durante ejecución).

### 7. Estado de Módulos (Auditoría Validada)
- VamO Compartido: OK (Reglas 60/55/50 y ahorro reflejadas).
- Municipal Ledger: OK (Valores volcados correctamente).
- Panel de Tránsito: OK (Suspensiones ejecutadas solo cuando severity=critical).
- Beneficios / Pozo: OK.
- Recibos: OK (Texto de ahorro integrado).

### 8. Evidencia (Ride IDs Muestrales)
- sim_ride_f8b64284_0\n- sim_ride_e40069dd_1\n- sim_ride_a604a102_2\n- sim_ride_7bacdac8_3\n- sim_ride_8812ac0a_4
... (y 35 más).

---
*Reporte generado automáticamente al finalizar la simulación.*