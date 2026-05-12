# FLUJO PASAJERO CONGELADO — NO MODIFICAR SIN AUTORIZACIÓN

**Estado:** ❄️ CONGELADO / PRODUCTION READY
**Última Validación:** 2026-05-09
**Entorno:** Producción (Firebase Hosting / Functions)

## Áreas Protegidas (NO TOCAR):
- **Rutas:** `/pasajero`, `/pasajero/onboarding`
- **Autenticación:** 
    - Creación de cuenta (Auth)
    - Validación de Email y Contraseña (UX estable sin animaciones)
- **Base de Datos:**
    - Inicialización atómica en Firestore (`completePassengerRegistrationV1`)
    - Actualización de perfil y campos obligatorios (`updateProfileV1`)
- **Documentación Legal:** Términos y condiciones (Paso 4)
- **Permisos:** Solicitud de ubicación y notificaciones (Paso 5)
- **Tutorial:** Lógica de primer ingreso en `/dashboard/ride`
- **Configuración PWA:** `public/manifest.webmanifest` y iconos asociados.

## Reglas de Intervención:
1. Solo se permite modificar si hay un **bug comprobado**.
2. Cualquier cambio debe ser **mínimo** y justificado.
3. **BACKUP/COMMIT obligatorio** antes de cualquier edición en estas rutas.
4. Se debe realizar una **prueba de flujo completo** (registro de usuario nuevo de punta a punta) después de cualquier cambio, por mínimo que sea.

---
*Este flujo ha sido validado para estabilidad absoluta en dispositivos móviles y navegadores web. No se permiten refactors, mejoras visuales ni cambios secundarios para evitar regresiones en la reconciliación del DOM y la pérdida de foco en inputs.*
