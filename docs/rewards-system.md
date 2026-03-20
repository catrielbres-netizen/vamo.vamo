# 🏆 Sistema de Pozo Semanal - Funcionamiento Detallado

El sistema de pozo semanal está diseñado para recompensar a los conductores más activos y comprometidos de las categorías superiores. Aquí se detalla su funcionamiento de principio a fin.

---

## 1. Activación Automática (El Disparador)

-   **Cuándo:** La función `distributeWeeklyPoolV4` se ejecuta automáticamente **todos los lunes a las 3:00 AM**, hora de Argentina (`America/Argentina/Buenos_Aires`).
-   **Cómo:** Utiliza un disparador programado de Cloud Functions (`onSchedule`). Esto garantiza que el proceso sea puntual y no requiera intervención manual.

---

## 2. Configuración Centralizada y Dinámica

Antes de hacer cualquier cálculo, la función lee su configuración desde un único documento en Firestore:

-   **Documento:** `rewards/rewards`

Este documento contiene dos campos clave:
-   `weeklyPoolAmount`: El monto total en ARS que se repartirá esa semana. Si es 0, la función no hace nada.
-   `minPointsToQualify`: La cantidad mínima de puntos que un conductor debe tener para poder participar en el reparto.

> **Ventaja:** Podés cambiar el monto del pozo o los puntos requeridos en cualquier momento desde la consola de Firebase, sin necesidad de hacer un nuevo deploy.

---

## 3. Identificación de Competidores (Elegibilidad)

No todos los conductores participan. El sistema filtra para encontrar solo a los competidores elegibles:

1.  **Filtro por Rol y Nivel:** Primero, busca en la colección `users` a todos los documentos donde `role` sea `driver` y `serviceTier` sea `premium` o `privado`. **Los conductores de nivel "Express" están excluidos del pozo.**
2.  **Filtro por Puntos Semanales:** Luego, para cada uno de esos conductores, consulta su documento en la colección `driver_points` y verifica que sus `weeklyPoints` sean iguales o mayores a `minPointsToQualify`.

Solo los conductores que pasan ambos filtros se consideran "elegibles" y entran en la fase de cálculo.

---

## 4. El Cálculo (La Magia Proporcional)

Una vez que tenemos la lista de conductores elegibles y sus puntos, el reparto se calcula de forma justa y proporcional:

1.  **Suma Total de Puntos:** El sistema suma los `weeklyPoints` de **todos** los conductores que calificaron. A esto lo llamamos `totalPoints`.
2.  **Cálculo de la Participación (Share):** Para cada conductor elegible, su porción del pozo se calcula con esta fórmula:
    
    ```
    (Puntos del Conductor / totalPoints) * weeklyPoolAmount
    ```
    
    *Ejemplo:* Si el pozo es de $10.000, el Conductor A tiene 150 puntos y el Conductor B tiene 50 puntos (y son los únicos dos que calificaron), el `totalPoints` es 200.
    -   Conductor A recibe: (150 / 200) * 10.000 = $7.500
    -   Conductor B recibe: (50 / 200) * 10.000 = $2.500

---

## 5. La Ejecución (Transacción Atómica y Segura)

Para garantizar la integridad de los datos, todo el proceso de distribución y reseteo se ejecuta dentro de una **transacción de Firestore**. Esto significa que todos los siguientes pasos ocurren como una sola operación indivisible: o se completan todos, o no se completa ninguno.

Para cada conductor ganador:
-   **Acreditación de Saldo:** Se actualiza su documento en `users`, incrementando su `currentBalance` con el monto de su `share`.
-   **Registro Contable:** Se crea un nuevo documento en `platform_transactions` con el `type` 'credit_promo', detallando el monto del bono y el motivo ("Bono del pozo semanal..."). Esto deja un rastro claro para auditorías.

Y una vez que todos los ganadores han sido procesados:
-   **Reseteo de Puntos:** La función actualiza los documentos en `driver_points` de **todos los conductores que tenían `weeklyPoints` > 0** (no solo los ganadores), estableciendo el campo `weeklyPoints` de nuevo a `0`.

---

## 6. El Reinicio Semanal

El paso final de la transacción es crucial: **los puntos semanales se reinician a cero para todos**. Esto asegura que la competencia para la siguiente semana comience desde cero para todos los conductores, manteniendo el sistema justo y competitivo cada semana.

Si en una semana nadie califica para el pozo, la función igualmente se encarga de resetear los puntos de todos los que hayan acumulado alguno.
