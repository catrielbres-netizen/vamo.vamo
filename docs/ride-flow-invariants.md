# VamO — Invariantes del Flujo de Viajes

Este documento establece las invariantes fundamentales del sistema de viajes de VamO.
Bajo ninguna circunstancia se debe comprometer o alterar el cumplimiento de estas reglas durante futuros refactors o implementaciones de features, ya que garantizan la estabilidad del Core y previenen fallas críticas y bloqueos en las aplicaciones de Conductores y Pasajeros.

## 1. Reglas de Creación (createRideV1)
1. **`dryRun` inerte:** El flag `dryRun = true` NUNCA debe desencadenar la creación de un ride real en la base de datos ni interactuar con operaciones de Transacción (`tx.set`, `tx.update`). Se utilizará estrictamente para devolver la estimación `estimatedTotal` y un `breakdown` tarifario previo al click de confirmación.
2. **Sincronía Estricta:** La función `createRideV1` debe responder `{ success: true }` y devolver un `rideId` **SOLO** después de que la transacción atómica de Firestore se consolide exitosamente (`tx.commit`).
3. **Bloqueo Visual:** La interfaz del Pasajero (`searching` animation / "Buscando conductor") solo puede renderizarse si existe constancia local de un `rideId` validado. El estado fantasma debe evitarse truncando tempranamente (`ghost prevention`).

## 2. Reglas del Motor de Emparejamiento (Matching)
4. **Independencia Territorial Geográfica:**  `drivers_locations` carece intencionalmente de la propiedad `cityKey` por optimizaciones de latencia y bandwidth. Por lo tanto, el sistema de matching NO DEBE depender de una condición `== cityKey` contra los locations, debiendo confiar plenamente en el radio de las queries GeoHash y posteriormente en los checks de elegibilidad del Perfil del Conductor (`operatingAreaId`).

## 3. Reglas de Salida y Liquidación (Settlement)
5. **Liberación Instantánea del Conductor:** Inmediatamente al completarse un viaje (`onRideSettlementV6`), el conductor DEBE conservar el estado `online` de forma ininterrumpida para seguir expuesto al motor de emparejamiento. La transacción dictamina:
   - `users/{driverUid}.driverStatus = 'online'`
   - `drivers_locations/{driverUid}.driverStatus = 'online'`
   - `users/{driverUid}.activeRideId = null`
6. **Robustez de la Facturación Visual:** El Receipt (`FinishedRideSummary` y `RideReceipt`) DEBE estar capacitado para renderizarse utilizando fallbacks del nodo `pricing` en caso de que el objeto consolidado `completedRide` se demore asíncronamente. El early-return por vacío ("No hay un resumen disponible") está prohibido.
7. **Inviabilidad de Calificación Duplicada:** Las calificaciones interpersonales están limitadas estructuralmente a **un solo intento exitoso** por cada lado (Pasajero y Conductor) mediante transacción y pre-validación de Firebase (`throw "already-exists"`). 
8. **Elegibilidad Incondicionada:** Un conductor se define como **"Disponible"** a ojos del motor solo si cumple tres axiomas simultáneamente: 
   - `driverStatus === 'online'` 
   - `activeRideId === null` 
   - `elegible === true` (Aprobado y sin suspensión temporal).
