# VamO — Manual Regression Checklist

Esta es la lista de pruebas manuales mínimas requeridas.
Cualquier desarrollador **DEBE** sobrepasar satisfactoriamente esta comprobación QA de forma obligatoria tras manipular ramas logísticas relacionadas a Matching, Ride Sessions, Pricing o la UI crítica de Conductor/Pasajero, o antes de preparar una Feature Release.

## Flujo Básico (1-to-1)

- [ ] **1. Estimación Transparente:** Verificar que cotizar un viaje (`dryRun = true`) calcule el precio correcto sin generar un registro fantasma de Ride en Firestore.
- [ ] **2. Persistencia y Transición:** Pulsar "Pedir Viaje", confirmar creación del root entry formal en `rides/{rideId}` y transición de la UI del pasajero al estado `searching`.
- [ ] **3. Invocación de Oferta:** Confirmar la labor del motor de empuje. Verificar creación del documento correspondiente en `rideOffers` con el estado `pending`.
- [ ] **4. Distribución Visual al Conductor:** Comprobar que en menos de ~2 segundos el componente de Recepción en el Driver App despliega la Modal de notificación con tarifa correcta (sin que el conductor cambie de ruta manualmente).
- [ ] **5. Aceptación Atómica (`acceptRideV2`):** El conductor pincha `Aceptar`. Comprobar blindaje anti-conflictos. Que el viaje se actualice.
- [ ] **6. Transición del Ciclo de Vida:** La base de datos y la UI deben virar mutuamente a `status = 'driver_assigned'` y acto seguido exponer la navegación in-app a ambos participantes.
- [ ] **7. Cumplimiento Terminal:** El conductor llega, pulsa el CTA para `Completar Viaje`. La orden es enviada asincrónica, el viaje cae a `completed`.
- [ ] **8. Recuperación Activa del Conductor:** El driver abandona limpiamente el receipt de turno y vuelve directo a visualización del Radar/Dashboard, y tanto Firestore `users` y `drivers_locations` marcan `driverStatus: online` invariablemente.
- [ ] **9. Comprobante Resiliente:** La pantalla del pasajero ilustra exitosamente sus datos de liquidación y monto final; si `completedRide` de Backend retrasa ms, acatar la UI para usar fallback paramétrico y jamás arrojar "Error nulo".
- [ ] **10. Efectiva Calificación P->C:** El pasajero llena el formulario 5 estrellas, le da al CTA submit, el botón se bloquea o deshabilita y se pinta logeo de UI visual indicando éxito.
- [ ] **11. Efectiva Calificación C->P:** El conductor realiza reciprocidad en su receipt modal asignando evaluación.
- [ ] **12. Mitigación contra Duplicación:** Refrescar apps nativamente o manipular peticiones por cURL/Postman contra los endpoints `submitRideRatingV1` no debe acarrear sobrescrituras (Error nativo: `already-exists`).
