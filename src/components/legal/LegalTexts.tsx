import React from 'react';

export const LegalSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <section className="mb-8">
        <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4 border-b border-white/10 pb-2">{title}</h3>
        <div className="space-y-4 text-xs leading-relaxed text-zinc-400 font-medium">
            {children}
        </div>
    </section>
);

export const PrivacyPolicyText = () => (
    <LegalSection title="Política de Privacidad y Uso de Datos">
        <p>VamO recopila, almacena y procesa información personal y de ubicación en tiempo real. Para los conductores, el rastreo GPS en segundo plano es estrictamente necesario para la asignación de viajes y cálculo de tarifas.</p>
        <p>Los datos recopilados no serán vendidos a terceros para fines publicitarios. Su uso se limita a operaciones de la plataforma, seguridad, soporte y cumplimiento de requerimientos de autoridades competentes (ej: municipios, fuerzas de seguridad).</p>
    </LegalSection>
);

export const LiabilityPolicyText = () => (
    <LegalSection title="Limitación de Responsabilidad de la Plataforma">
        <p>VamO opera <strong className="text-white">exclusivamente como una plataforma tecnológica de intermediación</strong>. VamO no presta servicios de transporte, logística ni remisería, ni funciona como una agencia de taxis tradicional.</p>
        <p>El Conductor es un contratista independiente que presta sus servicios por cuenta y riesgo propio. VamO no asume responsabilidad civil, penal ni laboral por incidentes, accidentes, demoras, daños a la propiedad o a terceros que ocurran durante o como consecuencia de un viaje coordinado a través de la aplicación.</p>
    </LegalSection>
);

export const PaymentWalletPolicyText = () => (
    <LegalSection title="Política de Pagos, Billetera y Comisiones">
        <p>VamO no retiene ni administra el dinero de los viajes. Los cobros de los viajes son realizados de manera directa por el Conductor al Pasajero (ya sea en efectivo o mediante código QR/transferencia de Mercado Pago).</p>
        <p>La plataforma cobra sus comisiones operativas mediante una <strong className="text-white">Billetera Virtual Interna (Ledger)</strong>. El Conductor debe realizar recargas prepagas en esta billetera. Por cada viaje completado, VamO debitará automáticamente la comisión correspondiente de dicho saldo.</p>
        <p>Si el saldo es negativo y supera el límite permitido, la cuenta será suspendida automáticamente hasta su regularización.</p>
    </LegalSection>
);

export const MercadoPagoPolicyText = () => (
    <LegalSection title="Política de Pagos Digitales (Mercado Pago)">
        <p>Los pagos procesados a través de Mercado Pago son transacciones directas entre el Pasajero y el Conductor. VamO actúa únicamente facilitando el enlace de pago (OAuth) para agilizar el proceso.</p>
        <p>VamO no es responsable por fondos retenidos, contracargos, fallas en la red de Mercado Pago, o problemas de validación de identidad en cuentas de terceros. Toda disputa sobre fondos transferidos digitalmente debe resolverse con Mercado Pago.</p>
    </LegalSection>
);

export const CancellationPolicyText = () => (
    <LegalSection title="Política de Cancelaciones">
        <p>Las cancelaciones recurrentes sin justificación afectan negativamente la confiabilidad de la red. Los Pasajeros que cancelen viajes cuando el Conductor ya está en camino o en el punto de origen podrán ser sujetos a tarifas de cancelación o deudas pendientes que deberán ser abonadas antes de solicitar un nuevo viaje.</p>
        <p>Los Conductores que acepten viajes y luego los cancelen repetidamente o fuercen al pasajero a cancelar, sufrirán penalizaciones en su puntuación y eventuales bloqueos preventivos o permanentes.</p>
    </LegalSection>
);

export const VerificationPolicyText = () => (
    <LegalSection title="Documentación, Veracidad y Verificación">
        <p>Todo usuario (Pasajero y Conductor) declara bajo juramento que los datos personales y documentos provistos son reales, vigentes y le pertenecen. El uso de identidades falsas, documentos adulterados o vehículos no declarados constituye una violación grave que resultará en la expulsión definitiva y el reporte a las autoridades.</p>
        <p>VamO se reserva el derecho de requerir documentación adicional o actualizaciones fotográficas en cualquier momento para mantener el estado activo de la cuenta.</p>
    </LegalSection>
);

export const ScoringPolicyText = () => (
    <LegalSection title="Sistema de Calificaciones y Scoring">
        <p>La permanencia en la plataforma está sujeta a un sistema de puntaje interno continuo (Scoring). Este sistema se alimenta de tasas de aceptación, tasas de cancelación, reportes de usuarios y cumplimiento de normas.</p>
        <p>A diferencia de sistemas tradicionales por estrellas, VamO evalúa métricas operativas reales. Un puntaje de riesgo alto derivará en restricciones temporales o la baja definitiva de la cuenta.</p>
    </LegalSection>
);

export const SuspensionPolicyText = () => (
    <LegalSection title="Política de Suspensiones y Bloqueos">
        <p>VamO, de forma autónoma o en respuesta a requerimientos de autoridades municipales/tránsito, podrá suspender cuentas preventivamente. Las causales incluyen, pero no se limitan a: saldos deudores, reportes de seguridad, vencimiento de documentación obligatoria o actividad sospechosa.</p>
        <p>Las suspensiones emitidas por requerimiento municipal deberán ser resueltas por el usuario directamente con la autoridad correspondiente antes de que VamO restaure el acceso.</p>
    </LegalSection>
);

export const DriverSpecificTerms = () => (
    <LegalSection title="Términos Específicos para Conductores">
        <p>Al aceptar estos términos, el Conductor reconoce que es responsable exclusivo del mantenimiento de su vehículo, la obtención de licencias comerciales o habilitaciones municipales requeridas en su jurisdicción, y el pago de seguros obligatorios.</p>
        <p>El Conductor se compromete a no utilizar marcas, logotipos o indumentaria de VamO que sugieran una relación de dependencia o representación oficial, salvo expresa autorización por escrito.</p>
    </LegalSection>
);

export const PassengerSpecificTerms = () => (
    <LegalSection title="Términos Específicos para Pasajeros">
        <p>El Pasajero se compromete a mantener un comportamiento respetuoso, no transportar sustancias ilícitas, y abonar puntualmente la tarifa acordada al finalizar el servicio. El Pasajero es responsable por los daños materiales ocasionados al vehículo por su negligencia o la de sus acompañantes.</p>
    </LegalSection>
);
