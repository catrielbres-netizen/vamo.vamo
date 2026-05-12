# VamO — Protocolo de Bloqueo de Flujo de Autenticación

Este documento define el comportamiento estricto y bloqueado de los flujos de autenticación y registro para Pasajeros y Conductores.

**IMPORTANTE: NO modificar los archivos marcados como "AUTH CORE" sin ejecutar los tests de regresión.**

## 1. Flujo del Pasajero

### Rutas Críticas
- **Login:** `/login/pasajero`
- **Registro:** `/registro/pasajero`
- **Onboarding:** `/dashboard/complete-profile`
- **Dashboard Operativo:** `/dashboard`

### Estados y Redirecciones
1. **Usuario Nuevo (Auth Only):** Redirige a `/dashboard/complete-profile`.
2. **Perfil Incompleto:** Bloqueado de `/dashboard`, redirigido a `/dashboard/complete-profile`.
3. **Perfil Activo:** Acceso total a `/dashboard`.

## 2. Flujo del Conductor

### Rutas Críticas
- **Login:** `/login/conductor`
- **Registro:** `/registro/conductor`
- **Onboarding Wizard:** `/driver/register`
- **Estado Municipal:** `/driver/muni-status`
- **Dashboard Operativo:** `/driver/rides` (o `/driver` que redirige)

### Estados y Redirecciones
1. **Registro Inicial:** Crea documento en `users` con `registrationStatus: "pending_profile"`.
2. **Onboarding (Wizard):** El conductor completa datos y sube fotos.
3. **Finalización:** Llama a `completeDriverOnboardingV1`.
4. **Post-Onboarding:** Redirige a `/driver/muni-status`.
5. **En Revisión:** Si `approved: false`, el conductor ve su estado municipal pero no puede operar.
6. **Aprobado:** Acceso al panel operativo de viajes.

## 3. Pruebas de Regresión (Checklist)

### Pasajero
- [ ] Registro exitoso -> Redirige a completar perfil.
- [ ] Perfil incompleto -> No puede entrar a `/dashboard`.
- [ ] Login con email no verificado -> Muestra aviso de verificación.

### Conductor
- [ ] Registro exitoso -> Redirige a Wizard.
- [ ] Finalización de Wizard -> Redirige a Estado Municipal (sin spinner infinito).
- [ ] Conductor no aprobado -> No puede ponerse "Online".
- [ ] Cierre de sesión -> Limpia estado y redirige a login.

## 4. Guardia de Despliegue (Build Guard)
El script `predeploy` en `package.json` asegura que el sistema compile correctamente antes de subir a Firebase.
Falla si hay errores de referencia (como el antiguo `user is not defined`).

---
*VamO Security Protocol — 2026*
