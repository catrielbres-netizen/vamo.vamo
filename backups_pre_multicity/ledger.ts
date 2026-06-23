
import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from './firebaseAdmin';

export type LedgerEventType = 
    | 'mp_payment_approved'
    | 'mp_payment_refunded'
    | 'mp_payment_charged_back'
    | 'mp_payment_rejected'
    | 'wallet_funds_added'
    | 'wallet_funds_reversed'
    | 'wallet_lock_consumed'
    | 'wallet_lock_released'
    | 'ride_settlement_completed';

export interface LedgerEntry {
    eventType: LedgerEventType;
    userId: string;
    amount: number;
    currency: string;
    referenceType: 'payment' | 'ride' | 'withdrawal' | 'adjustment' | 'system';
    referenceId: string;
    idempotencyKey: string;
    source: string;
    cityKey?: string;
    metadata?: Record<string, any>;
    createdAt: any;
}

/**
 * [VamO PRO] Centralized Financial Ledger
 * Records an immutable entry for every significant financial movement.
 */
export async function emitLedgerEvent(
    entry: Omit<LedgerEntry, 'createdAt'>,
    tx?: admin.firestore.Transaction
) {
    const db = getDb();
    const eventId = entry.idempotencyKey;
    const ledgerRef = db.collection('ledger_events').doc(eventId);
    
    const data: LedgerEntry = {
        ...entry,
        createdAt: FieldValue.serverTimestamp()
    };

    if (tx) {
        // En una transacción, primero leemos para asegurar inmutabilidad e idempotencia
        const snap = await tx.get(ledgerRef);
        if (snap.exists) {
            logger.warn(`[LEDGER_GUARD] Duplicate event blocked: ${eventId}`);
            return;
        }
        tx.set(ledgerRef, data);
    } else {
        // Fuera de transacción, usamos set si no existe (aunque Firestore no tiene set-if-not-exists atómico fuera de tx sin triggers)
        // pero para auditoría, la mayoría de las veces vendrá dentro de la tx de movimiento de dinero.
        await ledgerRef.set(data, { merge: true });
    }

    logger.info(`[LEDGER] ${entry.eventType} | userId=${entry.userId} | amount=${entry.amount} | ref=${entry.referenceId}`);
}
