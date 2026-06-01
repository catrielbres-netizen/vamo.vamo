# VamO – Plataforma Municipal de Movilidad Inteligente
*Control local, trazabilidad, beneficios sociales e integración de taxis, remises y paradas digitales.*

---

## 1. RESUMEN EJECUTIVO

**VamO** es una plataforma tecnológica soberana de movilidad, diseñada específicamente para ordenar, regular y co-gestionar el transporte urbano de pasajeros junto con la administración pública municipal. A diferencia de los modelos privados tradicionales (Uber, DiDi, Cabify), VamO coloca las decisiones tarifarias, regulatorias y operativas en manos del municipio, al tiempo que digitaliza y fortalece al sector profesional tradicional de taxis, remises y paradas físicas de despacho.

> *“VamO no reemplaza al municipio: lo fortalece. La movilidad urbana vuelve a estar bajo el control local de la ciudad.”*

---

## 2. EL PROBLEMA ACTUAL DE LA MOVILIDAD URBANA

En la era digital, los municipios patagónicos enfrentan severos desafíos de transporte:
1. **Falta de Control y Trazabilidad:** El transporte informal e ilegal crece sin que las autoridades de tránsito puedan fiscalizar de forma efectiva en la calle.
2. **Fuga de Capitales:** Las corporaciones extranjeras de viajes cobran comisiones abusivas a los conductores (de hasta el 35%) y evaden el pago de tasas municipales, girando divisas locales al exterior.
3. **Canibalización de Taxis y Remises:** El sector tradicional pierde clientes por carecer de herramientas tecnológicas ágiles de pedido y cotización previa.
4. **Desaparición de Paradas de Despacho:** Las paradas físicas tradicionales quedan invisibilizadas, amenazando la continuidad laboral de operadores y despachadores telefónicos.
5. **Fraude en Beneficios Sociales:** Los subsidios municipales de transporte (para jubilados y personas con discapacidad) carecen de mecanismos de auditoría en tiempo real, lo que propicia el mal uso y la fuga de recursos públicos.

---

## 3. LA SOLUCIÓN VamO: UN ECOSISTEMA INTEGRADO

VamO unifica todas las aristas de la movilidad en una infraestructura digital única:

```
                            ┌────────────────────────┐
                            │      MUNICIPIO         │
                            │  (Soberanía de Datos)  │
                            └───────────┬────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
      [Pasajero PWA]             [Conductor PWA]            [Tránsito Panel]
      - Tarifa Oficial           - Más Viajes               - Fiscalización GPS
      - Billetera Virtual        - Pozo Semanal             - Control Habilitación
      - Conductora Mujer         - Paradas Digitales        - Estadísticas
```

---

## 4. AUDITORÍA DE MÓDULOS DEL ECO-SISTEMA

* **A. Aplicación Pasajero (PWA):** Interfaz móvil web de bajo consumo, instalable sin fricción. Permite la cotización previa basada estrictamente en tarifas del Concejo Deliberante, billetera virtual **VamO Pay**, recibos electrónicos y trazabilidad de viaje.
* **B. Aplicación Conductor (PWA):** Onboarding digital de documentos, temporizador de oferta individual, balance de ganancias transparente, priorización de paradas y acceso al **Pozo Semanal** de incentivos.
* **C. VamO Muni:** Panel exclusivo de control municipal para la habilitación de choferes, edición dinámica de tarifas locales y monitoreo financiero de la tasa del **2%**.
* **D. Panel de Tránsito:** Monitor satelital en tiempo real para agentes en calle, permitiéndoles verificar habilitaciones por patente o número de licencia municipal al instante.
* **E. Conductora Mujer:** Módulo de seguridad preventiva real donde las pasajeras mujeres pueden solicitar conductoras asignadas en base a disponibilidad geográfica, sin derivaciones automáticas a choferes hombres.
* **F. Beneficios Sociales:** Descuentos automáticos del **10%** a jubilados y discapacitados. El municipio audita que no haya fraude y VamO compensa al conductor para que cobre el **100% de la tarifa oficial**.
* **G. VamO Compartido:** Agrupación inteligente de pasajeros con rutas coincidentes. Genera un ahorro de hasta el 40% al ciudadano y aumenta el ingreso por kilómetro recorrido para el conductor.
* **H. Pozo Semanal:** Acumula el 2.5% de la recaudación neta para bonificar semanalmente a los conductores mejor puntuados, incrementando la oferta y reduciendo rechazos de viaje.
* **I. Tarifa Dinámica SmartPricing:** Algoritmo regulado que solo permite descuentos hacia abajo en horas de baja demanda para reactivar el mercado local, respetando siempre la tarifa municipal máxima fijada por ordenanza.
* **J. Seguridad y Filtro Anti-Fraude (FAP):** Herramienta automática que audita viajes en tiempo real y realiza limpiezas preventivas de usuarios fantasmas o bloqueos de `activeRideId`.

---

## 5. REVOLUCIÓN OPERATIVA: LAS PARADAS DIGITALES

Una de las mayores innovaciones de VamO es la digitalización de la parada física de despacho tradicional. 

> *“VamO no elimina la parada: la convierte en una central digital.”*

### 5.1 Radio de Prioridad Core (0 a 500 metros)
* Si un viaje profesional es solicitado dentro de un radio de 500 metros de una parada activa, el viaje **ingresa de forma exclusiva al panel del operador de esa parada**.
* Ningún conductor del matching general puede ofertar por él.
* El operador de parada tiene **30 segundos** de exclusividad absoluta para asignar el viaje a un móvil de su cooperativa.
* Si el operador no responde a tiempo, el viaje se libera automáticamente al matching general para resguardar la experiencia del usuario.

### 5.2 Zona de Apoyo Fuera de Radio (501 a 1000 metros)
* Si el viaje se pide fuera de los 500 metros pero dentro de la zona de apoyo (hasta 1000m):
* Primero se ofrece a la red de matching general.
* Si no se encuentran conductores en el área o el límite de intentos falla, el sistema deriva el viaje como **"Apoyo Cercano"** al panel de la parada más cercana, pausando el matching general durante 30 segundos para que el operador local despache su flota.
* Esto maximiza la productividad del chofer adherido y garantiza la presencia de la parada física tradicional como nodo regulador de la ciudad.

---

## 6. VENTAJAS POR CADA ROL

### A. Para el Municipio y Tránsito
* **Recaudación del 2%:** Aporte directo para mantenimiento vial y garitas.
* **Control Absoluto:** Solo operan choferes aprobados por Transporte Municipal.
* **Soberanía de Datos:** Toda la analítica de orígenes, destinos y tiempos de espera es propiedad de la ciudad para la planificación urbana.

### B. Para los Pasajeros
* **Precios Transparentes:** Tarifas oficiales claras sin abusos de especulación dinámica.
* **Seguridad Ciudadana:** Trazabilidad satelital y conductores 100% identificados.
* **Inclusión Social:** Descuentos reales jubilado/discapacidad y filtro estricto Conductora Mujer.

### C. Para los Conductores y Paradas
* **Sustento del Puesto de Trabajo:** El operador despacha con tecnología de última generación Next.js.
* **Comisiones Sostenibles:** Tasa fija de 12% para taxis/remises profesionales, muy por debajo de la competencia multinacional.
* **Liquidación del 100%:** Los beneficios sociales los cubre VamO, el chofer nunca financia de su bolsillo los descuentos.

---

## 7. MATRIZ COMPARATIVA DE MERCADO

| Característica / Módulo | VamO | Uber / Cabify / DiDi | Radio Taxi Tradicional | App Local Genérica (Marca Blanca) |
| :--- | :---: | :---: | :---: | :---: |
| **Control Municipal** | **Total (Nativo)** | Nulo / Evasivo | Manual / Lento | Parcial |
| **Tarifa Oficial Máxima** | **Sí (Inflexible)** | No (Dinámica Libre) | Sí (Odómetro) | Sí |
| **Contribución Tributaria Local** | **Sí (2% Directo)** | No | No | No |
| **Monitoreo de Tránsito** | **Sí (Tiempo Real)** | No | No | No |
| **Integración de Paradas Físicas** | **Sí (Algoritmo Despacho)** | No | No | No |
| **Filtro Conductora Mujer Real** | **Sí (Estricto)** | Parcial | No | No |
| **Beneficios Sociales Controlados**| **Sí (Jubilado/Discapacidad)**| No | No | No |
| **Soberanía y Datos de la Ciudad** | **Sí (Propiedad Municipal)** | No | No | No |

---

## 8. MODELO ECONÓMICO Y DE DESPLIEGUE

### 8.1 Sostenibilidad
El modelo de VamO se autofinancia a través de la comisión de la plataforma (12% profesionales y 18% complementarios), de donde se deduce el 2% municipal y el 2.5% para el Pozo Semanal y cobertura de descuentos sociales.
*Nota: Los números finales dependen del volumen de viajes y del tarifario regulado por el Concejo Deliberante.*

### 8.2 Roadmap de Expansión
* **Fase 1: Rawson Profesional (Piloto):** Exclusivo taxis/remises, VamO Muni, Tránsito y Paradas Digitales en Rawson y Playa Unión.
* **Fase 2: Optimización Operativa:** Capacitación de operadores y validación en calle.
* **Fase 3: VamO Compartido:** Activación focalizada en horas pico escolares o de administración pública.
* **Fase 4: Servicio Express:** Habilitación de particulares regulados bajo cupo en zonas sin cobertura.
* **Fase 5: Expansión Chubut:** Trelew -> Madryn -> Comodoro -> Esquel -> Sarmiento.
* **Fase 6: Automatización Financiera:** Pasarela de split y liquidación bancaria automática.

---

## 9. CIERRE INSTITUCIONAL

> *“VamO ya no es solo una app de transporte. Es una infraestructura municipal de movilidad con control, trazabilidad, inclusión social, seguridad y capacidad de escalar ciudad por ciudad. Rawson tiene hoy la oportunidad de convertirse en la ciudad fundadora de este modelo de soberanía tecnológica en la Patagonia.”*
