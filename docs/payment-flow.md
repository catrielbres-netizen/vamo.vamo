# 💳 Flujo de Pagos End-to-End con Mercado Pago

Este documento detalla el proceso completo de carga de saldo para un conductor, desde la acción en la app hasta la acreditación final en su billetera.

---

### 1. Iniciar Carga de Saldo (Frontend)

-   **Componente:** `src/app/driver/earnings/PaymentForm.tsx`
-   **Acción:** El conductor ingresa un monto y hace clic en "Pagar con Mercado Pago".

### 2. Crear Preferencia (Frontend → Backend)

-   **Acción:** El frontend ejecuta un `fetch` a la Cloud Function `createPaymentPreferenceV4`, enviando el `amount` y un `Authorization: Bearer <token>` para identificar al conductor de forma segura.

### 3. Generar la Orden de Pago (Backend)

-   **Función:** `createPaymentPreferenceV4` en `functions/src/index.ts`
-   **Acción:**
    1.  Verifica el token del conductor.
    2.  Crea un objeto de preferencia para la API de Mercado Pago.
    3.  **Clave:** Guarda el `driverId` del conductor en el campo `external_reference`. Este es el dato que nos permitirá saber a quién acreditarle el saldo más tarde.
    4.  Especifica la `notification_url` que Mercado Pago usará para la notificación IPN.
    5.  Llama a la API de Mercado Pago.

### 4. Redirigir al Checkout (Backend → Frontend)

-   **Acción:**
    1.  Mercado Pago devuelve un `init_point` (URL de pago).
    2.  La Cloud Function envía esta URL de vuelta al frontend.
    3.  El frontend ejecuta `window.location.href = data.init_point`, redirigiendo al conductor al checkout de Mercado Pago.

### 5. Pago en Mercado Pago

-   **Acción:** El conductor completa el pago en la plataforma de Mercado Pago. La app VamO no interviene aquí. Al finalizar, Mercado Pago lo redirige a una de las `back_urls` (success, failure, pending).

### 6. Notificación Asíncrona (IPN)

-   **Acción:** Una vez el pago es **aprobado**, Mercado Pago envía una notificación `POST` a la `notification_url` definida en el paso 3.
-   **Endpoint:** `mercadoPagoWebhookV4` en `functions/src/index.ts`.
-   **Query Parameters:** La URL de la notificación recibe `topic=payment` y `id=<PAYMENT_ID>`. Ejemplo: `...run.app?topic=payment&id=123456789`

### 7. Validación del Webhook (Backend)

-   **Función:** `mercadoPagoWebhookV4`
-   **Acción:**
    1.  Extrae el `paymentId` de los **query parameters** de la URL (`req.query.id`).
    2.  **Validación de Firma:** Comprueba la cabecera `x-signature` para asegurar que la notificación proviene de Mercado Pago y no de un tercero malicioso.
    3.  Llama a la API de Mercado Pago con el `paymentId` para obtener el estado completo del pago.
    4.  Verifica que `payment.status` sea `approved`.

### 8. Acreditación del Saldo (Backend)

-   **Función:** `mercadoPagoWebhookV4`
-   **Acción:**
    1.  **Identificación:** Lee el `driverId` desde `payment.external_reference`.
    2.  **Idempotencia:** Usa el `paymentId` como ID de documento (`mp_${paymentId}`) para la transacción. Antes de hacer nada, verifica si ya existe una transacción con ese ID. Si existe, ignora la notificación para evitar dobles acreditaciones.
    3.  **Transacción Atómica:** Inicia una transacción de Firestore para garantizar que todas las operaciones se completen o ninguna.
    4.  Actualiza el `currentBalance` del conductor usando `FieldValue.increment(amount)`.
    5.  Crea un registro en la colección `platform_transactions` para auditoría.

### 9. Actualización en Tiempo Real (Frontend)

-   **Hook:** `useUser` (`src/firebase/auth/use-user.tsx`)
-   **Acción:** El hook `useUser` mantiene una suscripción en tiempo real al documento del conductor. Cuando el `currentBalance` cambia en Firestore (paso 8), el frontend recibe la actualización automáticamente y re-renderiza la interfaz para mostrar el nuevo saldo.

### 10. Persistencia y Auditoría

-   **Colección:** `platform_transactions`
-   **Resultado:** Queda un registro permanente e inmutable de cada carga de saldo, con el monto, el conductor, la referencia de Mercado Pago y la fecha. Esto es vital para la contabilidad y el soporte.
