import { Resend } from 'resend';
import { getDb } from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

// Variables de entorno quemadas o recuperadas
export const EMAILS_ENABLED = process.env.EMAILS_ENABLED === 'true';
export const EMAILS_TEST_TO = process.env.EMAILS_TEST_TO || 'cesareduardobres@gmail.com';
export const RESEND_API_KEY = process.env.RESEND_API_KEY || ''; // Cloud Functions will inject it from Secret Manager

// Instantiate with a dummy key if empty, to prevent top-level exceptions during Firebase deploy analysis
const resend = new Resend(RESEND_API_KEY || 're_dummy_key_for_build');

export const DEFAULT_FROM = process.env.EMAIL_FROM || 'VamO <notificaciones@vamoapp.com.ar>';

// Estructura de MailQueue
export interface MailQueueDocument {
    to: string;
    template: string;
    subject: string;
    data: any;
    status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped_duplicate';
    attempts: number;
    provider: 'resend';
    createdAt: any;
    updatedAt: any;
    sentAt: any | null;
    error: any | null;
    dedupeKey: string;
    providerMessageId?: string;
}

// Helper components
const buttonHtml = (text: string, url: string) => `
    <div style="text-align: center; margin: 30px 0;">
        <a href="${url}" style="background-color: #4F46E5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
            ${text}
        </a>
    </div>
`;

const activityCardHtml = (title: string, content: string) => `
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-top: 30px;">
        <h3 style="margin-top: 0; color: #0F172A; font-size: 18px; font-weight: 700;">${title}</h3>
        <div style="font-size: 15px; color: #475569;">
            ${content}
        </div>
    </div>
`;

const referralsHtml = () => `
    <div style="background-color: #F0FDF4; border: 1px dashed #86EFAC; border-radius: 12px; padding: 20px; margin-top: 30px; text-align: center;">
        <h3 style="margin-top: 0; color: #166534; font-size: 18px;">Invitá a otra persona a usar VamO</h3>
        <p style="font-size: 14px; color: #15803D; margin-bottom: 20px; line-height: 1.6;">Compartí la app con familiares, vecinos o compañeros. Cuantos más usuarios tenga VamO en tu ciudad, más rápido crece el servicio local.</p>
        <a href="https://www.vamoapp.com.ar" style="background-color: #166534; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px;">
            Compartir VamO
        </a>
    </div>
`;

const baseTemplate = (content: string) => `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #000000; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">VamO</h1>
        </div>
        <div style="padding: 40px 30px; color: #334155; font-size: 16px; line-height: 1.6;">
            ${content}
        </div>
        <div style="background-color: #F8FAFC; padding: 20px; text-align: center; border-top: 1px solid #F1F5F9;">
            <p style="margin: 0; color: #94A3B8; font-size: 13px;">VamO Argentina - Equipo de Soporte y Operaciones</p>
            <p style="margin: 8px 0 0 0; color: #CBD5E1; font-size: 11px;">Este es un email automático, por favor no respondas a esta dirección.</p>
        </div>
    </div>
`;

export const EmailTemplates: Record<string, (data: any) => string> = {
    // ---------------- DRIVERS ----------------
    driver_registration_created: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">¡Registro exitoso!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>Tu registro en VamO fue creado correctamente. Tu zona operativa asignada es <strong>${data.cityName}</strong>.</p>
        
        <p style="margin-top: 24px; padding: 16px; background-color: #FFFBEB; border-left: 4px solid #F59E0B; border-radius: 0 8px 8px 0; color: #92400E;">
            <strong>Próximos pasos:</strong> Para poder conectarte y recibir viajes, tenés que subir la documentación requerida para tu habilitación.
        </p>

        ${buttonHtml('Completar habilitación', 'https://www.vamoapp.com.ar/driver/muni-status')}
        
        <p style="font-size: 14px; color: #64748B; text-align: center; margin-top: 24px;">Una vez habilitado, acá podrás ver tus ganancias estimadas y estadísticas de viaje.</p>
    `),
    
    driver_onboarding_completed: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">Solicitud Recibida</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>Tu solicitud y documentación han sido recibidas exitosamente.</p>
        <p>Tu perfil se encuentra ahora en revisión por nuestro equipo operativo.</p>
        
        ${buttonHtml('Ver estado de revisión', 'https://www.vamoapp.com.ar/driver')}
    `),
    
    driver_pending_documents: (data) => baseTemplate(`
        <h2 style="color: #B45309; font-size: 22px; font-weight: 800; margin-top: 0;">Acción Requerida</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>Aún tenemos documentos pendientes de subir a tu perfil.</p>
        <p>Recordá que para empezar a recibir viajes, debés completar tu legajo ingresando a la app.</p>
        
        ${buttonHtml('Subir documentos', 'https://www.vamoapp.com.ar/driver/muni-status')}
    `),
    
    document_received: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">Documento Recibido</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>Recibimos tu documento: <strong>${data.documentName}</strong>.</p>
        <p>Será revisado por el área correspondiente. Te avisaremos cuando tenga novedades.</p>
        
        ${buttonHtml('Abrir VamO', 'https://www.vamoapp.com.ar/driver')}
    `),
    
    document_approved: (data) => baseTemplate(`
        <h2 style="color: #15803D; font-size: 22px; font-weight: 800; margin-top: 0;">¡Documento Aprobado!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>Tu documento <strong>${data.documentName}</strong> fue aprobado exitosamente.</p>
        
        ${buttonHtml('Revisar estado', 'https://www.vamoapp.com.ar/driver/muni-status')}
    `),
    
    document_observed: (data) => baseTemplate(`
        <h2 style="color: #B91C1C; font-size: 22px; font-weight: 800; margin-top: 0;">Documento Observado</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>Tu documento <strong>${data.documentName}</strong> necesita corrección.</p>
        <p style="margin-top: 20px; padding: 15px; background-color: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 0 8px 8px 0; color: #991B1B;">
            <strong>Motivo:</strong> ${data.reason}
        </p>
        
        ${buttonHtml('Corregir documento', 'https://www.vamoapp.com.ar/driver/muni-status')}
    `),
    
    driver_enabled: (data) => baseTemplate(`
        <h2 style="color: #15803D; font-size: 22px; font-weight: 800; margin-top: 0;">¡Cuenta Habilitada!</h2>
        <p>Hola <strong>${data.name}</strong>, ¡excelentes noticias! Tu cuenta de conductor ya está completamente habilitada.</p>
        
        <div style="background-color: #F0FDF4; border: 1px dashed #86EFAC; border-radius: 12px; padding: 20px; margin-top: 24px; text-align: center;">
            <h3 style="margin-top: 0; color: #166534; font-size: 18px;">Ayudanos a activar VamO en tu zona</h3>
            <p style="font-size: 14px; color: #15803D; margin-bottom: 20px; line-height: 1.6;">Cuantos más conductores se sumen y completen su registro, más rápido podremos activar la zona para operar.</p>
            ${buttonHtml('Invitar Conductor', 'https://www.vamoapp.com.ar/login/?role=driver')}
        </div>

        ${buttonHtml('Conectarme en VamO', 'https://www.vamoapp.com.ar/driver')}
    `),

    driver_how_to_operate_vamo: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">Cómo empezar a recibir viajes</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>Ya estás a un paso de comenzar a generar ingresos con VamO:</p>
        <ol style="margin-bottom: 24px; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Verificá que tu Habilitación esté aprobada.</li>
            <li style="margin-bottom: 8px;">Conectate tocando el botón "Conectar" en la pantalla principal.</li>
            <li style="margin-bottom: 8px;">Cuando recibas una solicitud, tenés unos segundos para aceptarla.</li>
            <li style="margin-bottom: 8px;">Al llegar al destino, deslizá para finalizar el viaje y cobrar.</li>
        </ol>
        
        ${buttonHtml('Abrir VamO', 'https://www.vamoapp.com.ar/driver')}
    `),

    driver_wallet_intro: (data) => {
        const statsHtml = (data.weeklyEarnings || data.weeklyRides) ? `
            <ul style="margin: 0; padding-left: 20px;">
                ${data.weeklyRides ? `<li style="margin-bottom: 8px;">Viajes realizados: <strong>${data.weeklyRides}</strong></li>` : ''}
                ${data.weeklyEarnings ? `<li style="margin-bottom: 8px;">Ganancia bruta: <strong>$${data.weeklyEarnings}</strong></li>` : ''}
                ${data.walletBalance ? `<li style="margin-bottom: 8px;">Saldo actual: <strong>$${data.walletBalance}</strong></li>` : ''}
            </ul>
        ` : `<p style="margin: 0;">Cuando completes tus primeros viajes, vas a poder ver acá tus estadísticas y ganancias.</p>`;

        return baseTemplate(`
            <h2 style="color: #15803D; font-size: 22px; font-weight: 800; margin-top: 0;">Cómo funciona tu billetera VamO</h2>
            <p>Hola <strong>${data.name}</strong>,</p>
            <p>En la sección Billetera podés ver el detalle de todos tus cobros, comisiones y tu saldo neto.</p>
            
            ${activityCardHtml('Tu actividad reciente', statsHtml)}

            ${buttonHtml('Ver mi billetera', 'https://www.vamoapp.com.ar/driver')}
        `);
    },

    driver_inactive_reminder: (data) => {
        const statsHtml = data.weeklyRides ? 
            `<p style="margin: 0;">Esta semana acumulaste <strong>${data.weeklyRides} viajes</strong>${data.weeklyEarnings ? ` y una ganancia estimada de <strong>$${data.weeklyEarnings}</strong>` : ''}.<br/><br/>¡Conectate cuando estés disponible para seguir aumentando tus ingresos!</p>` : 
            `<p style="margin: 0;">Hay pasajeros esperando conductores activos en tu zona. ¡Más conexión significa más oportunidades de viajes!</p>`;

        return baseTemplate(`
            <h2 style="color: #B45309; font-size: 22px; font-weight: 800; margin-top: 0;">Volvé a conectarte</h2>
            <p>Hola <strong>${data.name}</strong>,</p>
            <p>Notamos que hace unos días no te conectás a la aplicación.</p>
            
            ${activityCardHtml('Tu actividad', statsHtml)}

            ${buttonHtml('Volver a conectarme', 'https://www.vamoapp.com.ar/driver')}
            
            ${referralsHtml()}
        `);
    },

    // ---------------- PASSENGERS ----------------
    passenger_how_to_use_vamo: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">Cómo pedir tu primer viaje en VamO</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>¡Bienvenido! Pedir tu viaje es muy fácil:</p>
        <ul style="margin-bottom: 24px; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Ingresá tu destino en la pantalla principal.</li>
            <li style="margin-bottom: 8px;">Elegí tu forma de pago (efectivo, Mercado Pago o saldo VamO Pay).</li>
            <li style="margin-bottom: 8px;">Confirmá el viaje y te asignaremos un conductor seguro.</li>
        </ul>
        <p>Recordá que podés compartir tu recorrido en tiempo real con contactos para mayor seguridad.</p>

        ${buttonHtml('Abrir VamO', 'https://www.vamoapp.com.ar/dashboard/ride')}

        ${referralsHtml()}
    `),

    passenger_shared_rides_intro: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">Ahorrá viajando compartido</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>¿Sabías que podés ahorrar dinero en tus viajes diarios?</p>
        <p>Al elegir <strong>Viaje Compartido</strong> en la app, agrupamos tu recorrido con el de otros pasajeros que van en la misma dirección, compartiendo el costo total.</p>
        
        ${activityCardHtml('Beneficios', `
            <ul style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Ahorro de hasta un 40% en tu viaje.</li>
                <li style="margin-bottom: 8px;">Mismo nivel de seguridad y soporte.</li>
                <li>Reducción de huella de carbono en tu ciudad.</li>
            </ul>
        `)}

        ${buttonHtml('Probar viaje compartido', 'https://www.vamoapp.com.ar/dashboard/ride')}
    `),

    passenger_vamo_pay_intro: (data) => {
        const statsHtml = data.walletBalance ? 
            `<p style="margin: 0; font-size: 24px; font-weight: bold; color: #0F172A;">$${data.walletBalance}</p><p style="margin: 4px 0 0 0; font-size: 13px;">Disponible para tus próximos viajes.</p>` :
            `<p style="margin: 0;">El saldo VamO Pay que recibas por promociones o devoluciones se acreditará automáticamente.</p>`;

        return baseTemplate(`
            <h2 style="color: #15803D; font-size: 22px; font-weight: 800; margin-top: 0;">Cómo usar tu saldo VamO Pay</h2>
            <p>Hola <strong>${data.name}</strong>,</p>
            <p>El saldo a tu favor en <strong>VamO Pay</strong> puede usarse para pagar automáticamente tus próximos viajes seleccionándolo como método de pago.</p>
            
            ${activityCardHtml('Tu Saldo VamO Pay', statsHtml)}

            <p style="margin-top: 24px; padding: 16px; background-color: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 0 8px 8px 0; color: #991B1B; font-size: 14px;">
                <strong>Regla clara:</strong> El saldo VamO Pay no es retirable en efectivo ni transferible a Mercado Pago. Sirve exclusivamente como crédito interno para pagar futuros viajes en la app.
            </p>

            ${buttonHtml('Abrir VamO', 'https://www.vamoapp.com.ar/dashboard/ride')}
        `);
    },

    passenger_inactive_reminder: (data) => {
        const statsHtml = data.weeklyRides ? 
            `<p style="margin: 0;">Gracias por haber realizado <strong>${data.weeklyRides} viajes</strong> con nosotros.<br/><br/>Tu próximo viaje puede estar a un toque. Abrí VamO y pedí un conductor disponible en tu zona.</p>` : 
            `<p style="margin: 0;">Tu próximo viaje está a solo un toque de distancia. Abrí VamO y viajá seguro.</p>`;

        return baseTemplate(`
            <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">Te estamos esperando en VamO</h2>
            <p>Hola <strong>${data.name}</strong>,</p>
            <p>Notamos que hace unos días no pedís un viaje con nosotros. Seguimos conectándote con conductores locales al mejor precio.</p>
            
            ${activityCardHtml('Tu actividad en VamO', statsHtml)}

            ${buttonHtml('Pedir viaje', 'https://www.vamoapp.com.ar/dashboard/ride')}

            ${referralsHtml()}
        `);
    },

    // --- LAUNCH EMAILS (PASSENGERS) ---
    passenger_launch_minus_2d: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">¡Ya falta muy poco!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>En tan solo <strong>2 días</strong> vas a poder pedir viajes con VamO en tu ciudad.</p>
        <p>Estamos ultimando detalles para asegurarnos de que tengas la mejor experiencia, con viajes seguros y a precios justos.</p>
        
        ${buttonHtml('Abrir VamO', 'https://www.vamoapp.com.ar/dashboard/ride')}
    `),

    passenger_launch_minus_1d: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">¡Mañana es el gran día!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>A partir de mañana, VamO empieza a funcionar en tu ciudad.</p>
        <p>Preparate para moverte de forma inteligente. Asegurate de tener la app lista o guardada en la pantalla de inicio de tu celular.</p>
        
        ${buttonHtml('Abrir VamO', 'https://www.vamoapp.com.ar/dashboard/ride')}
    `),

    passenger_launch_0d: (data) => baseTemplate(`
        <h2 style="color: #15803D; font-size: 22px; font-weight: 800; margin-top: 0;">¡VamO ya está activo!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>¡El día llegó! VamO ya está activo en tu ciudad.</p>
        <p>Ya podés pedir tu primer viaje con nosotros. Conductores locales están listos para llevarte a donde necesites, de forma segura y económica.</p>
        
        ${buttonHtml('Pedir mi primer viaje', 'https://www.vamoapp.com.ar/dashboard/ride')}
        
        ${referralsHtml()}
    `),

    // --- LAUNCH EMAILS (DRIVERS) ---
    driver_launch_minus_2d: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">¡Prepará tu cuenta!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>En <strong>2 días</strong> VamO abre oficialmente para pasajeros en tu ciudad.</p>
        <p>Esto significa que empezarán a llegar solicitudes de viaje. Asegurate de que tu vehículo esté en condiciones y tu perfil completo.</p>
        
        ${buttonHtml('Ir a mi panel', 'https://www.vamoapp.com.ar/driver/dashboard')}
    `),

    driver_launch_minus_1d: (data) => baseTemplate(`
        <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0;">¡Mañana empiezan los viajes!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>A partir de mañana, VamO estará habilitado para pasajeros en tu ciudad.</p>
        <p>Conectate temprano para captar los primeros pedidos y empezar a ganar. Recordá mantener un buen nivel de aceptación para destacarte en la plataforma.</p>
        
        ${buttonHtml('Ir a mi panel', 'https://www.vamoapp.com.ar/driver/dashboard')}
    `),

    driver_launch_0d: (data) => baseTemplate(`
        <h2 style="color: #15803D; font-size: 22px; font-weight: 800; margin-top: 0;">¡VamO ya está activo para pasajeros!</h2>
        <p>Hola <strong>${data.name}</strong>,</p>
        <p>¡Llegó el día! Ya habilitamos la aplicación para que los pasajeros de tu ciudad puedan pedir viajes.</p>
        <p><strong>Ya podés conectarte.</strong> Asegurate de tener saldo en VamO Pay o métodos de pago configurados si aplica. ¡Te deseamos muchos éxitos en tus primeros viajes!</p>
        
        ${buttonHtml('Conectarme ahora', 'https://www.vamoapp.com.ar/driver/dashboard')}
    `)
};

export async function sendEmailWithResend(options: { to: string, subject: string, html: string }) {
    let finalTo = options.to;
    let finalSubject = options.subject;

    if (!EMAILS_ENABLED) {
        // Test Mode: DO NOT rewrite user emails to admin anymore.
        // Instead, we just log and skip the actual Resend API call to prevent accidental spam
        // unless it's explicitly aimed at a test domain/internal domain (optional, but safe to just mock entirely).
        console.log(`[TEST_MODE] Email Skipped. OriginalTo: ${options.to}. Subject: ${finalSubject}`);
        // Devuelve un mock ID para que la base de datos marque el status como 'sent' pero nunca salió
        return `mock_id_${new Date().getTime()}`;
    }

    const { data, error } = await resend.emails.send({
        from: DEFAULT_FROM,
        to: [finalTo],
        subject: finalSubject,
        html: options.html
    });

    if (error) {
        throw new Error(error.message);
    }

    return data?.id; // providerMessageId
}

export async function enqueueTransactionalEmailV1(params: {
    to: string;
    template: string;
    subject: string;
    data: any;
    dedupeKey: string;
}) {
    const db = getDb();
    const docData: MailQueueDocument = {
        to: params.to,
        template: params.template,
        subject: params.subject,
        data: params.data,
        status: 'pending',
        attempts: 0,
        provider: 'resend',
        createdAt: FieldValue.serverTimestamp() as any,
        updatedAt: FieldValue.serverTimestamp() as any,
        sentAt: null,
        error: null,
        dedupeKey: params.dedupeKey
    };
    
    try {
        await db.collection('mail_queue').add(docData);
    } catch (e) {
        console.error(`[MAIL_QUEUE_ENQUEUE_ERROR] Fallo al encolar email:`, e);
    }
}
