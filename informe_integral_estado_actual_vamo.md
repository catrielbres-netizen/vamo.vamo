# AUDITORÍA INTEGRAL Y ESTADO ACTUAL: PLATAFORMA VamO
*Infraestructura Tecnológica y Soberanía Local de Movilidad Urbana*

---

## 1. INTRODUCCIÓN Y VISIÓN INSTITUCIONAL

### 1.1 ¿Qué es VamO hoy?
**VamO** no es simplemente una aplicación de solicitud de viajes en el mercado de la economía digital de plataformas. **VamO es una infraestructura digital de movilidad urbana soberana, regulada y co-gestionada por el estado municipal.**

A diferencia de las corporaciones transnacionales de movilidad (como Uber, Cabify o DiDi) cuyos modelos extraen valor de la economía local hacia paraísos fiscales sin adherir a las normativas de transporte locales, VamO se constituye como una plataforma diseñada desde y para el municipio. Integra de manera armoniosa a:
* El **Municipio** (a través de herramientas de auditoría en tiempo real y una recaudación del **2%** para el desarrollo urbano).
* Los **Pasajeros** (a través de tarifas oficiales transparentes, billetera digital unificada y el acceso real a beneficios sociales controlados).
* Los **Conductores Profesionales** de taxis y remises (garantizando más viajes y protección contra la precarización).
* Las **Paradas Digitales** tradicionales (digitalizando su operatividad sin destruir la estructura del operador de despacho).

> *“VamO no reemplaza al municipio: lo fortalece. VamO no elimina la parada: la convierte en una central digital. La movilidad urbana vuelve a estar bajo el control local.”*

---

## 2. AUDITORÍA GENERAL DE MÓDULOS DE SISTEMA

El sistema VamO se compone de un ecosistema interconectado de 5 portales principales (Frontend PWA y Paneles Administrativos Next.js) y un motor centralizado de Cloud Functions e integraciones en la base de datos distribuida en tiempo real de Firestore.

```
                  ┌──────────────────────────────────────┐
                  │          Superadmin Panel            │
                  └──────────────────┬───────────────────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  │           VamO Muni Panel           │
                  └──────────────────┬───────────────────┘
                                     │
      ┌──────────────────────────────┼──────────────────────────────┐
      │                              │                              │
┌─────▼─────┐                  ┌─────▼─────┐                  ┌─────▼─────┐
│ Pasajero  │◄────────────────►│ Conductor │◄────────────────►│ Tránsito  │
│  App PWA  │   Billetera /    │  App PWA  │    Auditoría /   │   Panel   │
│           │   Viajes         │           │    Fiscalización │           │
└───────────┘                  └─────┬─────┘                  └───────────┘
                                     │
                               ┌─────▼─────┐
                               │ Parada    │
                               │ Digital   │
                               └───────────┘
```

### Módulo A: Aplicación del Pasajero (PWA)
* **Registro e Inicio de Sesión:** Sistema robusto basado en Firebase Auth con inicio de sesión telefónico/email. Vinculación inmediata a perfil en base de datos.
* **Cotización de Viaje:** Motor matemático dinámico `rideFinancials` y `PassengerSearchingSheet` que calcula la tarifa oficial base, distancia y recargos por nocturnidad o domingos, evitando desvíos y proyecciones fraudulentas.
* **Pedido de Viaje:** Flujo de estados reactivo en tiempo real (`searching` -> `offered` -> `accepted` -> `arrived` -> `started` -> `completed` / `cancelled`).
* **Beneficios Sociales:** Integración nativa con tarifas reducidas para jubilados y personas con discapacidad (10% de descuento directo), absorbiendo VamO la diferencia financiera para que el conductor cobre la tarifa oficial al 100%.
* **VamO Pay / Wallet:** Billetera digital unificada que permite cargar saldo de manera local o mediante pasarelas (MercadoPago), con control transaccional estricto (prevención de saldos negativos y doble gasto mediante Firebase Transactions).
* **Recibos Digitales:** Emisión automática de recibo/factura virtual tras finalizar el viaje, con desglose de subsidios, aportes municipales y descuentos.
* **Filtro Conductora Mujer:** Garantía de seguridad e inclusión donde las pasajeras mujeres pueden solicitar exclusivamente conductoras mujeres, con pre-chequeo activo de disponibilidad en el área y sin fallback automático a conductores masculinos para resguardar la privacidad.
* **Experiencia de Usuario PWA:** Instalable directamente desde navegadores móviles (iOS/Android), reduciendo la fricción de descarga en tiendas tradicionales y el consumo de datos.

### Módulo B: Aplicación del Conductor (PWA)
* **Registro y Onboarding:** Formulario integrado de registro de chofer y carga digital de documentos críticos (licencia profesional, habilitación de vehículo, seguro, desinfección).
* **Aprobación Municipal:** Los documentos y perfiles de conductores ingresan a un estado inactivo (`pending_approval`) hasta ser auditados por VamO Muni.
* **Recepción y Aceptación de Ofertas:** Sistema de cola de ofertas individualizadas con temporizador de 15 segundos para evitar distracciones en conducción y optimizar la tasa de aceptación.
* **Pozo Semanal:** Módulo motivacional gamificado que acumula parte de las comisiones en un fondo semanal para premiar al Top 10 de conductores activos de la ciudad.
* **Integración con Paradas Digitales:** Prioridad en asignaciones locales si el conductor se encuentra registrado físicamente o adherido a una parada activa.

### Módulo C: VamO Muni (Panel de Control de la Ciudad)
* **Aprobación de Conductores:** Interfaz administrativa para fiscalizadores municipales donde pueden auditar, aprobar o suspender choferes y vehículos.
* **Gestión de Tarifas:** Panel dinámico para cambiar los valores de bajada de bandera, ficha cada 100 metros, espera nocturna y límites máximos por ciudad (`cityKey`).
* **Paradas Digitales:** Altas, bajas y edición de paradas asignando el radio de prioridad (ej. 500m) y zona de apoyo (ej. 1000m).
* **Auditoría del 2% Municipal:** Visualización y balance de la recaudación tributaria por cada viaje completado en el ejido urbano.

### Módulo D: Panel de Tránsito (Fiscalización en Calle)
* **Visualización Operativa:** Mapa interactivo en tiempo real con geolocalización de vehículos activos y su estado operativo (`online`, `offline`, `en viaje`).
* **Apoyo a Fiscalización:** Permite a los agentes de tránsito en calle verificar de forma instantánea mediante patente o código municipal si un coche que circula levantando pasajeros está debidamente registrado y habilitado en la plataforma.
* **Alertas e Incidentes:** Canal de incidencias para recibir notificaciones en caso de que un conductor inicie un viaje sin la documentación al día.

### Módulo E: Panel de Superadmin / Admin Global
* **Configuraciones Globales del Sistema:** Acceso total al control de la plataforma multiciudad.
* **Auditoría y Finanzas:** Conciliación de saldos de billeteras virtuales, comisiones de la plataforma, cobros de pasarelas de pago y egresos por beneficios sociales.
* **Simulaciones Operativas:** Herramienta Peak Hour Simulator (PHS) para proyectar el comportamiento de la red ante picos de demanda.
* **Limpieza de Datos Activos:** Botones de contingencia para resolver viajes trabados (`activeRideId` huérfanos) y purga de anomalías operativas del servidor.

### Módulo F: VamO Compartido (Movilidad Solidaria)
* **Formación de Grupos:** Algoritmo dinámico que agrupa a pasajeros con trayectos coincidentes en tiempo real.
* **Bloqueo de Beneficios:** Cuando un viaje es Compartido, el sistema bloquea automáticamente otros beneficios acumulados (jubilados, discapacidad, etc.). **VamO Compartido ya es el beneficio.**
* **Hoja de Ruta Optimizada:** Generación secuencial de paradas de recogida (*pickup*) y bajada (*dropoff*) para el conductor.
* **Tarifa Compartida:** Descuento directo en la tarifa del pasajero de hasta el 40%, al tiempo que garantiza un ingreso bruto superior para el conductor al consolidar múltiples pasajes.

### Módulo G: Paradas Digitales (Despacho Avanzado)
* **Operador de Parada:** Pantalla premium adaptada para tablets y PCs de despachadores de paradas tradicionales.
* **Algoritmo de Prioridad Core (0-500m):** Si un viaje profesional se pide dentro de 500 metros de una parada, entra con exclusividad al panel del operador. Ningún conductor general puede ofertar por él. El operador tiene **30 segundos** para asignar el viaje a un móvil de su parada de forma manual.
* **Algoritmo de Apoyo Cercano (501-1000m):** El viaje primero se ofrece al matching general. Si no se encuentran conductores en el matching normal o el límite se agota, el sistema deriva el viaje al panel de la parada más cercana como **"Apoyo Cercano"**, pausando el matching general durante otros 30 segundos para que el operador lo resuelva.
* **Retorno Controlado:** Si el operador no asigna en el tiempo límite, el viaje retorna al matching general sin generar bloqueos operativos.

---

## 3. IMPACTO DE BENEFICIOS Y PROPUESTA DE VALOR POR ROL

### 3.1 Pasajeros: Movilidad Segura y Accesible
* **Soporte Local Real:** No lidia con robots de soporte transnacionales; tiene un canal local de atención en su ciudad.
* **Acceso Inclusivo:** Integración de descuentos directos que subsidian la tarifa para sectores vulnerables (jubilados/discapacidad).
* **Seguridad Absoluta:** Certeza de que el conductor está habilitado municipalmente y cuenta con seguro vigente.
* **VamO Compartido:** Ahorro sustancial en transporte diario sin perder comodidad.
* **Conductora Mujer:** Función real de seguridad preventiva. *“Conductora Mujer transforma una necesidad de seguridad en una función real del sistema.”*

### 3.2 Conductores Profesionales (Taxis/Remises): Defensa de la Actividad
* **Digitalización sin Amenazas:** El taxista tradicional no compite contra un sistema informal desregulado; se digitaliza bajo sus propias reglas.
* **Prioridad y Respeto a las Paradas:** Las paradas físicas conservan su clientela e influencia geográfica a través del panel del operador digital.
* **Cobro al 100%:** El conductor nunca financia los descuentos sociales del pasajero; VamO le liquida la tarifa oficial completa.
* **Incentivo por Desempeño:** Acceso al Pozo Semanal para premiar el esfuerzo continuo y la calidad de servicio.

### 3.3 Conductores Particulares (VamO Express): Oportunidad Regulada
* **Legalidad de Trabajo:** Oportunidad de generar ingresos en un marco regulado y aprobado por el Concejo Deliberante de la ciudad.
* **Comisiones Justas y Claras:** Liquidación transparente sin comisiones abusivas ocultas (fijada en un porcentaje sustentable de desarrollo).
* **Integración Armoniosa:** VamO asegura que los particulares actúen como apoyo complementario y no destructivo del sistema profesional tradicional.

### 3.4 Municipios: Soberanía Tecnológica y Control Urbano
* **Control Real del Transporte:** Acceso a datos estadísticos de orígenes, destinos, horas pico y tiempos de espera para planificar el desarrollo urbano.
* **Tasa del 2% para la Ciudad:** Cada viaje genera ingresos directos para las arcas municipales, destinados a obras viales y mejoras en paradas de colectivos y taxis.
* **Garantía Documental Activa:** Eliminación del transporte ilegal e informal.
* **Soberanía Tecnológica Local:** El municipio posee la llave de configuración del sistema de transporte de su propia ciudad. *“La movilidad urbana vuelve a estar bajo control local.”*

### 3.5 Operadores de Paradas: Conservación de la Autoridad
* **Centrales Digitales Inteligentes:** El operador ya no despacha mediante gritos o radios de baja calidad; gestiona su flota en una pantalla premium Next.js.
* **Productividad Demostrable:** Registro histórico del volumen de viajes despachados y rendimiento de la parada frente a las autoridades.
* **Reducción de Conflictos:** Asignación justa, transparente y ordenada de turnos y viajes. *“VamO no elimina la parada: la convierte en una central digital.”*

---

## 4. ANÁLISIS ECONÓMICO Y FINANCIERO

El modelo financiero de VamO se basa en el principio de **sustentabilidad mutua y economía circular**, asegurando que los subsidios no comprometan la viabilidad de la plataforma.

```
                     ┌──────────────────────────┐
                     │     VIAJE COMPLETADO     │
                     └────────────┬─────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
[Conductor]                 [Municipalidad]                [VamO]
  Chofer cobra el 100%        Tasa de contribución          Sustento de plataforma
  de la tarifa oficial        del 2% para la ciudad         y Pozo Semanal
```

### 4.1 Parámetros Clave del Ecosistema Financiero
1. **Tasa de Contribución Municipal (2%):** Aporte directo de cada viaje completado al erario municipal para reinversión en obras viales.
2. **Comisión de Plataforma:**
   * **Conductores Profesionales:** Fijo de **12%** (sostenible y muy por debajo del 25% al 35% de Uber/DiDi).
   * **Conductores Express (Particulares):** Fijo del **18%** (reflejando el canon de regularización urbana).
3. **Fondo de Beneficios Sociales (Subsidio Cruzado):**
   * El descuento del **10%** a jubilados y discapacitados es financiado por el fondo de comisiones de VamO.
   * El conductor profesional recibe **siempre el 100% de la tarifa oficial** al liquidar el viaje, garantizando la paz social con el sector.
   * **Regla Anti-Acumulación:** Los viajes Compartidos o Express bloquean otros beneficios sociales. **VamO Compartido ya es el beneficio.**
4. **Pozo Semanal de Motivación:**
   * Se nutre del **2.5%** de las comisiones netas mensuales cobradas por la plataforma.
   * Se distribuye entre los 10 conductores con mayor ranking de rendimiento y menor tasa de cancelación de la semana, impulsando la retención laboral y reduciendo los tiempos de espera del pasajero.

---

## 5. ESCALABILIDAD OPERATIVA Y TÉCNICA

### 5.1 Multi-Ciudad a través de `cityKey`
La arquitectura de base de datos en Firestore y las Cloud Functions de Firebase están completamente aisladas mediante el parámetro clave `cityKey`. 
Esto significa que añadir una nueva localidad (ej. expandir el sistema de **Rawson** hacia **Trelew**, **Madryn** o **Comodoro Rivadavia**) requiere únicamente la declaración de sus límites geopolíticos y su tarifario oficial en la base de datos de administración global:

```
VamO Platform (Multi-City Sandbox)
  ├── Rawson (cityKey: rawson) ──► Tarifas Oficiales ──► Paradas (Musters, etc.)
  ├── Trelew (cityKey: trelew) ──► Tarifas Oficiales ──► Paradas Integradas
  └── Comodoro (cityKey: comodoro) ──► Tarifas Oficiales ──► Paradas Locales
```

### 5.2 Qué falta automatizar para el Crecimiento Masivo
Para dar el salto a una expansión provincial o nacional, se requiere:
1. **Automatización de Pasarela de Split Bancario (Ej. MercadoPago Split):** Liquidación automatizada instantánea al conductor (86%), al municipio (2%) y a la plataforma VamO (12%) al momento de finalizar un viaje con tarjeta.
2. **Sincronización de Registros Nacionales (API SINTYS / Mi Argentina):** Validación automática de antecedentes penales e inhabilitaciones de licencia de conducir en el onboarding de choferes.

---

## 6. ESTRATEGIA DE LANZAMIENTO RECOMENDADA

Para garantizar el éxito de la plataforma sin generar fricciones políticas o desbalances económicos, recomendamos un despliegue secuencial en 4 fases operativas:

### Fase 1: Rawson Profesional y Soberano (Lanzamiento Piloto)
* **Alcance:** Exclusivo para Taxis y Remises habilitados en Rawson y Playa Unión.
* **Activaciones:** Módulo VamO Muni, Panel de Tránsito, Beneficios Sociales del 10% (Jubilados/Discapacidad), Filtro Conductora Mujer y el Pozo Semanal de incentivo.
* **Objetivo:** Demostrar a los sindicatos y al municipio que la app los potencia, los organiza y digitaliza sus operaciones tradicionales sin devaluar sus puestos de trabajo.

### Fase 2: Digitalización de Paradas Físicas
* **Alcance:** Integración total de las principales paradas de taxi de la ciudad en la plataforma.
* **Activaciones:** Activación de las **Paradas Digitales** con operadores locales capacitados. Despliegue del algoritmo de 0-500m y 501-1000m (Apoyo Cercano).
* **Objetivo:** Erradicar la idea de que la tecnología elimina puestos administrativos, integrando al despachador de parada como un nodo de asignación inteligente.

### Fase 3: VamO Compartido Controlado
* **Alcance:** Habilitación progresiva del módulo compartido en horarios pico específicos (ej. entrada/salida escolar, cambios de turno en hospitales públicos, traslados masivos de Rawson a Playa Unión).
* **Objetivo:** Aliviar la carga económica del usuario diario y optimizar la tasa de ocupación de vehículos sin saturar la red.

### Fase 4: VamO Express (Particulares) de Apoyo Regulado
* **Alcance:** Ingreso controlado de conductores particulares bajo un registro estricto con cupos dinámicos en zonas o franjas horarias con déficit comprobado de cobertura profesional.
* **Objetivo:** Satisfacer la demanda total de la ciudadanía sin perjudicar el sustento de taxis y remises tradicionales.

---

## 7. CONCLUSIÓN INSTITUCIONAL

**VamO ya no es solo una app de transporte. VamO es una plataforma soberana de movilidad urbana.** 

Con control y trazabilidad gubernamental en tiempo real, beneficios sociales resguardados de fraude, integración pionera de paradas tradicionales, herramientas de fiscalización en calle para agentes de tránsito y capacidad de escalar de forma limpia ciudad por ciudad. 

*El objetivo ahora es consolidar el ordenamiento del lanzamiento en Rawson, capacitar a los operadores de parada físicos en el portal de Next.js y validar en campo la experiencia de viaje del pasajero real.*
