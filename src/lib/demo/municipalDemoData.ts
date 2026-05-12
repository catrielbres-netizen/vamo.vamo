export const DEMO_CITY_INFO = {
    name: 'Rawson',
    province: 'Chubut',
    population: '31.000',
    fee: '5%'
};

export const MOCK_STATS = {
    municipalEarnings: 485900,
    totalRides: 12450,
    activeDrivers: 84,
    pendingDrivers: 12,
    observedDrivers: 5,
    expiredDrivers: 3,
    expansionProgress: 88,
    weeklyPool: 185000
};

export const MOCK_DRIVERS = [
    { id: '1', name: 'Juan Pérez', vehicle: 'Toyota Corolla', plate: 'AA 123 BB', status: 'active', phone: '280 4123456', lastRide: 'Hace 5 min' },
    { id: '2', name: 'Lucía Méndez', vehicle: 'Fiat Cronos', plate: 'AF 456 CC', status: 'pending_review', phone: '280 4556677', submittedAt: 'Hoy 10:15' },
    { id: '3', name: 'Ricardo Gómez', vehicle: 'Chevrolet Onix', plate: 'AD 789 DD', status: 'observed', phone: '280 4998877', detail: 'Seguro por vencer' },
    { id: '4', name: 'Elena Paz', vehicle: 'Ford Focus', plate: 'AC 321 EE', status: 'expired', phone: '280 4112233', expiredAt: 'Ayer' },
];

export const MOCK_AUDIT_LOGS = [
    { id: 'LOG-102', action: 'APROBACIÓN', detail: 'Conductor Juan Pérez habilitado por Operador 04', date: '30/04 12:40' },
    { id: 'LOG-101', action: 'OBSERVACIÓN', detail: 'Legajo Ricardo Gómez observado: Foto de carnet ilegible', date: '30/04 11:20' },
    { id: 'LOG-100', action: 'ALERTA', detail: 'Vencimiento detectado: Seguro de unidad AC 321 EE', date: '30/04 09:00' },
];

export const DEMO_FAQS = [
    {
        q: "¿Qué controla la municipalidad?",
        a: "La municipalidad tiene control total sobre quién opera en la ciudad, validando seguros, licencias profesionales y estado de los vehículos en tiempo real."
    },
    {
        q: "¿Puede un conductor trabajar sin habilitación?",
        a: "No. El sistema bloquea automáticamente a cualquier conductor que no tenga su legajo municipal aprobado o que presente documentación vencida."
    },
    {
        q: "¿Qué pasa si vence el seguro?",
        a: "VamoMuni detecta el vencimiento 48hs antes y emite una alerta. Si llega el día del vencimiento sin renovación, el conductor es suspendido automáticamente."
    },
    {
        q: "¿Cómo gana dinero el municipio?",
        a: "Por cada viaje realizado, el municipio percibe una tasa directa (ej: 5%) que se acredita de forma instantánea en la cuenta municipal."
    },
    {
        q: "¿Qué ve el inspector?",
        a: "El inspector tiene una vista de tránsito con el mapa en vivo, historial de conductores y capacidad de verificar QR de habilitación en calle."
    },
    {
        q: "¿Qué datos quedan auditados?",
        a: "Todas las acciones: quién aprobó a un conductor, cuándo se liquidó un pago y cada cambio en la configuración de la ciudad."
    },
    {
        q: "¿Cómo se aprueba un conductor?",
        a: "El municipio revisa el checklist digital cargado por el conductor. Si todo es correcto, se presiona 'Aprobar' y el conductor queda habilitado para recibir viajes."
    },
    {
        q: "¿Qué pasa si se observa un legajo?",
        a: "El conductor recibe una notificación push indicando qué documento debe corregir, sin ser rechazado definitivamente."
    },
    {
        q: "¿Cómo se liquida la participación municipal?",
        a: "El saldo se acumula en tiempo real. El tesorero puede solicitar la transferencia de fondos a la cuenta bancaria municipal con un solo clic."
    },
    {
        q: "¿Cómo se adapta esto a otra ciudad?",
        a: "VamoMuni es multijurisdiccional. Cada ciudad tiene su propia configuración de tarifas, zonas de operación y equipo de inspectores."
    }
];

export const DEMO_TOUR_STEPS = [
    {
        id: 'step-1',
        section: 'resumen',
        title: '¡Hola! Soy VamO Taxi',
        message: 'Bienvenido al Portal de Control Municipal de Rawson. Voy a mostrarte cómo modernizamos el transporte juntos.',
        actions: [{ label: 'Empezar Recorrido', next: 'step-2' }]
    },
    {
        id: 'step-2',
        section: 'drivers',
        title: 'Control de Conductores',
        message: 'Aquí ves a todos los conductores activos. Cada uno tiene su identidad validada y seguro vigente.',
        actions: [{ label: 'Ver Pendientes', next: 'step-3' }]
    },
    {
        id: 'step-3',
        section: 'habilitaciones',
        title: 'Habilitaciones en Trámite',
        message: 'Estos conductores enviaron su documentación y esperan tu revisión. Nada ocurre sin tu permiso.',
        actions: [{ label: 'Ver Alertas', next: 'step-4' }]
    },
    {
        id: 'step-4',
        section: 'vencimientos',
        title: 'Gestión de Vencimientos',
        message: 'El sistema vigila 24/7. Si una licencia vence, el conductor queda suspendido hasta que la renueve.',
        actions: [{ label: 'Ver un Legajo', next: 'step-5' }]
    },
    {
        id: 'step-5',
        section: 'legajos',
        title: 'El Legajo Digital',
        message: 'Toda la información del conductor en un solo lugar. Fotos, documentos y datos técnicos.',
        actions: [{ label: 'Ver Checklist', next: 'step-6' }]
    },
    {
        id: 'step-6',
        section: 'checklist',
        title: 'Checklist Municipal',
        message: 'Personalizá los requisitos de inspección física. Marcá cada ítem antes de habilitar la unidad.',
        actions: [{ label: 'Simular Acción', next: 'step-step-actions' }]
    },
    {
        id: 'step-step-actions',
        section: 'actions',
        title: 'Aprobación Instantánea',
        message: 'Al presionar "Aprobar", el conductor recibe su credencial digital y puede empezar a trabajar.',
        actions: [{ label: 'Ver Mapa', next: 'step-9' }]
    },
    {
        id: 'step-9',
        section: 'mapa',
        title: 'Mapa Territorial',
        message: 'Visualizá la demanda y la ubicación de los móviles en tiempo real sobre el mapa de la ciudad.',
        actions: [{ label: 'Ver Viajes', next: 'step-10' }]
    },
    {
        id: 'step-10',
        section: 'viajes',
        title: 'Historial de Viajes',
        message: 'Cada viaje queda registrado: origen, destino, tarifa y trazado de ruta para auditoría total.',
        actions: [{ label: 'Ver Tesorería', next: 'step-11' }]
    },
    {
        id: 'step-11',
        section: 'tesoreria',
        title: 'Tesorería Municipal',
        message: 'Mirá cómo crece el saldo de la ciudad. Transparencia total en la recaudación por tasa de transporte.',
        actions: [{ label: 'Ver Tasa', next: 'step-12' }]
    },
    {
        id: 'step-12',
        section: 'participacion',
        title: 'Participación por Viaje',
        message: 'Explicamos el desglose: 85% Conductor, 5% Ciudad. Un modelo justo para todos.',
        actions: [{ label: 'Ver Beneficios', next: 'step-13' }]
    },
    {
        id: 'step-13',
        section: 'pozo',
        title: 'Incentivos y Pozo',
        message: 'Fomentamos la excelencia. Los mejores conductores acceden a premios financiados por el sistema.',
        actions: [{ label: 'Ver Expansión', next: 'step-14' }]
    },
    {
        id: 'step-14',
        section: 'expansion',
        title: 'Expansión Chubut',
        message: 'VamoMuni crece. Estamos conectando Rawson con Trelew y Madryn en una red provincial.',
        actions: [{ label: 'Ver Auditoría', next: 'step-15' }]
    },
    {
        id: 'step-15',
        section: 'auditoria',
        title: 'Auditoría Total',
        message: 'Cada acción deja una huella digital. Seguridad jurídica y transparencia para la gestión.',
        actions: [{ label: 'Ver Ordenanza', next: 'step-16' }]
    },
    {
        id: 'step-16',
        section: 'documentacion',
        title: 'Marco Legal',
        message: 'Respaldamos la gestión con la Ordenanza de Modernización del Transporte vigente.',
        actions: [{ label: 'Cierre', next: 'step-17' }]
    },
    {
        id: 'step-17',
        section: 'cierre',
        title: 'El Futuro es Ahora',
        message: 'Rawson toma el liderazgo tecnológico en la provincia. ¿Empezamos?',
        actions: [{ label: 'Finalizar Recorrido', next: 'step-1' }]
    }
];
