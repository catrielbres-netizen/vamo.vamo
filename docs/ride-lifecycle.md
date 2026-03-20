# 🧭 DIAGRAMA OFICIAL — CICLO DE VIDA DEL VIAJE

## 🎯 Objetivo del sistema

Garantizar consistencia entre:

* documento ride
* perfil pasajero
* perfil conductor
* visibilidad en tiempo real

---

# 🔁 MÁQUINA DE ESTADOS DEL RIDE

```
┌────────────────────┐
│ searching          │ ← creación pasajero
└─────────┬──────────┘
          │ driver acepta (transacción)
          ▼
┌────────────────────┐
│ assigned           │
└─────────┬──────────┘
          │ driver llega
          ▼
┌────────────────────┐
│ arrived            │
└─────────┬──────────┘
          │ inicia viaje
          ▼
┌────────────────────┐
│ in_progress        │
└─────────┬──────────┘
          │ finaliza
          ▼
┌────────────────────┐
│ completed          │ (terminal)
└────────────────────┘
```

---

# ❌ ESTADOS TERMINALES

Desde cualquier estado activo:

```
cancelled_by_passenger
cancelled_by_driver
cancelled_by_system
expired
```

Todos son estados finales.

---

# 🔐 INVARIANTES DE INTEGRIDAD (OBLIGATORIOS)

## Ride visible para conductores

```
status == searching
driverId == null
expiresAt > now
```

## Ride asignado correctamente

```
status in [assigned, arrived, in_progress]
driverId != null
driver.activeRideId == ride.id
passenger.activeRideId == ride.id
```

## Estado terminal consistente

```
status in TERMINAL →
driver.activeRideId == null
passenger.activeRideId == null
```

## Usuario sin corrupción

```
if user.activeRideId != null:
  ride existe AND ride no es terminal
```

---

# ⚙️ EVENTOS DEL SISTEMA

## PASAJERO

### requestRide()

Precondiciones:

* activeRideId null o fantasma autocorregido

Efectos:

```
create ride
status = searching
driverId = null
passenger.activeRideId = ride.id
expiresAt = now + TTL
```

---

## CONDUCTOR

### acceptRide() (TRANSACCIÓN ATÓMICA)

Validaciones:

```
ride.status == searching
ride.driverId == null
driver.activeRideId == null
```

Efectos:

```
ride.status = assigned
ride.driverId = driver.id
driver.activeRideId = ride.id
```

---

### handleArrived()

```
ride.status = arrived
```

### handleStartRide()

```
ride.status = in_progress
```

### handleCompleteRide()

```
ride.status = completed
clear driver.activeRideId
clear passenger.activeRideId
```

---

## SISTEMA (AUTOMÁTICO)

### Expiración

Trigger:

```
now > expiresAt AND status == searching
```

Acción:

```
status = expired
clear passenger.activeRideId
```

---

### Autocorrección de datos sucios

Trigger:

```
user.activeRideId existe pero ride no válido
```

Acción:

```
clear user.activeRideId
```

---

# 👁️ MODELO DE VISIBILIDAD EN TIEMPO REAL

## Query del conductor

```
rides
where status == searching
where expiresAt > now
```

Requiere índice compuesto:

```
status ASC
expiresAt ASC
```

---

# 🧪 MATRIZ DE VERIFICACIÓN RÁPIDA

| Evento       | Ride             | Pasajero          | Conductor |
| ------------ | ---------------- | ----------------- | --------- |
| Creación     | searching        | activeRideId=ride | —         |
| Aceptación   | assigned         | activo            | activo    |
| Inicio       | in_progress      | activo            | activo    |
| Finalización | completed        | limpio            | limpio    |
| Expiración   | expired          | limpio            | —         |

---

# 🛡️ GARANTÍAS DEL SISTEMA

El sistema es consistente si:

✔ ningún usuario tiene más de un ride activo
✔ todo ride asignado tiene conductor
✔ todo ride visible no tiene conductor
✔ estados terminales limpian referencias
✔ el matching depende solo de estado + tiempo

---

# 🧱 PRINCIPIOS ARQUITECTÓNICOS

1. El ride es la fuente de verdad
2. Los perfiles solo referencian
3. Transiciones críticas siempre transaccionales
4. Estados terminales limpian sistema
5. Todo error debe ser observable
6. El sistema debe autocorregirse
