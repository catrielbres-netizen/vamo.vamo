# 🔒 FROZEN — VamO Conductor Flow

> **Estado: CONGELADO**
> Validado en producción el 2026-05-09.
> No modificar sin autorización explícita y sin seguir el protocolo de descongelamiento.

---

## ✅ Estado Validado en Producción

### Test de validación real — `UID: EY7q7PnkqLPJjnL35IiT7zoJd8O2`

| Campo Firestore               | Valor validado               | Estado |
|-------------------------------|------------------------------|--------|
| `role`                        | `"driver"`                   | ✅     |
| `cityKey`                     | `"rawson"`                   | ✅     |
| `profileCompleted`            | `true`                       | ✅     |
| `onboardingCompleted`         | `true`                       | ✅     |
| `municipalStatus`             | `"pending_municipal_review"` | ✅     |
| `approved`                    | `false`                      | ✅     |
| `driverStatus`                | `"offline"`                  | ✅     |
| `driverSubtype`               | `"express"`                  | ✅     |
| `docsStatus`                  | `"municipal_review"`         | ✅     |
| `documentsManagedByMunicipality` | `true`                    | ✅     |

### Token JWT — Validado

| Momento                        | Claims                              | Estado |
|-------------------------------|--------------------------------------|--------|
| Post-registro inicial (cityKey vacío) | `{"r":"driver","ck":"","v":1}` | ✅ Token NO revocado |
| Post-onboarding completo       | `{"r":"driver","ck":"rawson","v":2}` | ✅ Claims correctos |

### Comportamiento del flujo validado

- ✅ Token **no** revocado con `cityKey` vacío en registro inicial
- ✅ Claims finales correctos (`r=driver`, `ck=rawson`)
- ✅ Firestore final con todos los campos obligatorios
- ✅ **Sin pantalla blanca** al finalizar el wizard
- ✅ **Sin retorno al formulario** al refrescar post-onboarding
- ✅ Modal "¡Registro Enviado!" aparece correctamente
- ✅ Botón "Ir a mi Panel" navega a `/driver/rides`
- ✅ Cartel de revisión municipal visible en dashboard
- ✅ Conductor **no puede ponerse online** sin aprobación municipal

---

## 🚫 Archivos Congelados — NO TOCAR

### Frontend

| Archivo | Razón |
|---|---|
| `src/app/driver/page.tsx` | Pantalla de bienvenida pública |
| `src/app/driver/login/page.tsx` | Login conductor |
| `src/app/driver/register/page.tsx` | Entry point registro |
| `src/app/driver/rides/page.tsx` | Dashboard principal conductor |
| `src/app/driver/DriverClientLayout.tsx` | Guards de auth y onboarding |
| `src/components/driver/DriverRegisterClient.tsx` | Paso 0: creación de cuenta |
| `src/components/driver/DriverOnboardingWizard.tsx` | Wizard 4 pasos |
| `public/manifest-driver.webmanifest` | PWA / Play Store branding |

### Backend (Cloud Functions)

| Función | Razón |
|---|---|
| `completeDriverRegistrationV1` | Crea el doc inicial del conductor |
| `completeDriverOnboardingV1` | Cierra el onboarding, setea `profileCompleted: true` |
| `unifiedUserClaimsManagerV1` *(lógica driver)* | Fix crítico: no revocar token con `cityKey` vacío |

### Rutas congeladas

```
/driver
/driver/login
/driver/register
/driver/rides
```

---

## 📋 Reglas de Descongelamiento

### 1. Sólo ante bug comprobado

No se aceptan:
- Refactors de conveniencia
- Nuevas animaciones en inputs del registro
- Cambios a los guards de `/driver/register` o `/driver/rides`
- Cambios a la lógica de claims del conductor
- Cambios al wizard de onboarding

### 2. Protocolo obligatorio antes de tocar

```bash
# 1. Crear commit de backup
git add -A && git commit -m "chore: backup antes de modificar flujo conductor congelado"

# 2. Prueba pasajero (confirmar que no se rompe)
# → Abrir /pasajero en incógnito, hacer viaje de prueba.

# 3. Prueba conductor completa
# → Registrar conductor nuevo desde /driver
# → Completar wizard completo
# → Confirmar modal, panel, revisión municipal
```

### 3. Protocolo obligatorio después de tocar

```bash
# 1. Build limpio obligatorio
npm run build

# 2. Prueba completa de /driver
# → /driver en incógnito: ver bienvenida (NO login, NO wizard)
# → /driver/login: login existente funciona
# → /driver/register: registro nuevo completo

# 3. Registrar conductor nuevo real
# → Completar los 4 pasos del wizard
# → Verificar: NO pantalla blanca
# → Verificar: modal "Registro enviado"
# → Verificar: llega a /driver/rides
# → Verificar: cartel revisión municipal
# → Refrescar: NO vuelve a /driver/register

# 4. Verificar Firestore
# → profileCompleted: true
# → onboardingCompleted: true
# → municipalStatus: "pending_municipal_review"
# → approved: false
# → driverStatus: "offline"
# → cityKey: valor válido (no vacío)

# 5. Verificar claims JWT (no revocados)
# → r: "driver"
# → ck: cityKey válido
# → v: versión incrementada

# 6. Deploy
firebase deploy --only "hosting,functions"
```

---

## 🧠 Arquitectura del Flujo (Referencia)

```
/driver  (pública)
  ├── No autenticado → Pantalla bienvenida
  │     ├── "Crear cuenta" → /driver/register
  │     └── "Ya tengo cuenta" → /driver/login
  └── Autenticado + profileCompleted → /driver/rides

/driver/register
  ├── No autenticado → Form de email/contraseña
  │     └── Submit → createUserWithEmailAndPassword
  │                → completeDriverRegistrationV1 (doc inicial, cityKey:"")
  │                → DriverOnboardingWizard
  └── Autenticado + profileCompleted → redirect /driver/rides

DriverOnboardingWizard (4 pasos)
  ├── Paso 1: Datos personales (nombre, DNI, teléfono, ciudad, foto)
  ├── Paso 2: Vehículo (marca, modelo, año, patente, color, foto)
  ├── Paso 3: Tipo conductor (express / profesional)
  └── Paso 4: Confirmación → finishOnboarding()
        └── completeDriverOnboardingV1()
              → profileCompleted: true
              → cityKey: válido
              → municipalStatus: "pending_municipal_review"
              └── Modal "¡Registro Enviado!" → /driver/rides

/driver/rides (guard: requiere auth + role=driver)
  ├── profileCompleted: false → redirect /driver/register (con grace period 4s)
  ├── municipalStatus: "pending_municipal_review" → Cartel bloqueante
  └── municipalStatus: "active" + approved: true → Dashboard operativo
```

### Fix crítico aplicado en `unifiedUserClaimsManagerV1`

```typescript
// ANTES (ROTO): revocaba el token si cityKey era vacío
} else if (['admin_municipal', 'traffic_municipal', 'driver'].includes(role) && !isValidCityKey(cityKey)) {
    shouldNullify = true; // ← MATABA la sesión en el registro inicial
}

// DESPUÉS (CORRECTO): solo revoca para drivers post-onboarding
} else if (['admin_municipal', 'traffic_municipal'].includes(role) && !isValidCityKey(cityKey)) {
    shouldNullify = true;
} else if (role === 'driver' && profileCompleted === true && !isValidCityKey(cityKey)) {
    shouldNullify = true; // ← Solo si onboarding ya fue completado
}
```

---

## 📅 Historial de Cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-05-09 | Fix bug raíz: token revocado con cityKey vacío | Antigravity |
| 2026-05-09 | Fix DialogTitle faltante en modal de éxito (Radix crash) | Antigravity |
| 2026-05-09 | Grace period 4s en guard de onboarding (false redirect) | Antigravity |
| 2026-05-09 | Separación UX: credenciales vs datos personales | Antigravity |
| 2026-05-09 | Pantalla bienvenida /driver (pública, sin redirect al login) | Antigravity |
| 2026-05-09 | **CONGELADO** — Validado en producción | Usuario |

---

> ⚠️ **Este archivo es parte del contrato operativo del sistema.**
> Modificarlo sin seguir el protocolo equivale a modificar el flujo congelado.
