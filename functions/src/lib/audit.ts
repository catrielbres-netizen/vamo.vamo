import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getDb } from './firebaseAdmin';
import { AuditLog, LedgerEvent, LedgerEventType, Role } from '../types';

export type MunicipalAction = 
    | "user_created" | "user_updated" | "municipal_driver_status_change" 
    | "municipal_document_requested" | "muni_payout_approved";

export interface MunicipalAuditAction {
    cityKey: string;
    actorUid: string;
    actorName: string;
    actorEmail: string;
    actorRole: Role;
    action: MunicipalAction | string;
    targetType: "user" | "driver" | "payout" | "ride" | "other";
    targetId: string;
    metadata?: any;
    createdAt?: Timestamp | FieldValue;
}

/**
 * [VamO PRO] Centralized Audit Logger
 * Records changes to sensitive documents.
 */
export async function logAuditAction(params: {
    actorId: string;
    actorRole: Role;
    action: string;
    collection: string;
    documentId: string;
    before?: any;
    after?: any;
    riskScore?: number;
    source: "client" | "function" | "admin";
    ip?: string;
    device?: string;
}) {
    const db = getDb();
    const logId = `audit_${Date.now()}_${params.documentId.substring(0, 5)}`;
    
    // Identify changed fields
    const changedFields: string[] = [];
    if (params.before && params.after) {
        const keys = new Set([...Object.keys(params.before), ...Object.keys(params.after)]);
        keys.forEach(key => {
            if (JSON.stringify(params.before[key]) !== JSON.stringify(params.after[key])) {
                changedFields.push(key);
            }
        });
    }

    const log: AuditLog = {
        id: logId,
        ...params,
        changedFields,
        riskScore: params.riskScore || 0,
        createdAt: FieldValue.serverTimestamp()
    };

    try {
        await db.collection('audit_logs').doc(logId).set(log);
        logger.info(`[AUDIT] Action ${params.action} on ${params.collection}/${params.documentId} logged.`);
    } catch (e) {
        logger.error(`[AUDIT_ERROR] Failed to write log:`, e);
    }
}

/**
 * [VamO PRO] Ledger Event Logger
 * Records business milestones for the operational ledger.
 */
export async function logLedgerEvent(params: {
    eventType: LedgerEventType;
    actorId: string;
    actorRole: Role;
    targetId?: string;
    rideId?: string;
    passengerId?: string;
    driverId?: string;
    cityKey?: string;
    amount?: number;
    metadata?: any;
}) {
    const db = getDb();
    const eventId = `ledger_${Date.now()}_${params.eventType}`;
    
    const now = new Date();
    // Argentina offset approximation (UTC-3)
    const argDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    
    const dayKey = argDate.toISOString().split('T')[0];
    const monthKey = dayKey.substring(0, 7);
    
    // Simple week calculation
    const firstDayOfYear = new Date(argDate.getFullYear(), 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    const weekKey = `${argDate.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

    const event: LedgerEvent = {
        id: eventId,
        ...params,
        dayKey,
        weekKey,
        monthKey,
        createdAt: FieldValue.serverTimestamp()
    };

    try {
        await db.collection('ledger_events').doc(eventId).set(event);
    } catch (e) {
        logger.error(`[LEDGER_ERROR] Failed to write event:`, e);
    }
}

/**
 * [VamO MUNI] Legacy/Muni Audit Logger
 * Specifically for municipal events.
 */
export async function logMunicipalAction(params: MunicipalAuditAction) {
    const db = getDb();
    const cityKey = params.cityKey || 'global';
    
    const logData = {
        ...params,
        createdAt: FieldValue.serverTimestamp()
    };

    try {
        await db.collection('municipal_audit_log').add(logData);
        // Also feed into the main AuditLog for unified view
        await logAuditAction({
            actorId: params.actorUid,
            actorRole: params.actorRole,
            action: `MUNI_${params.action.toUpperCase()}`,
            collection: 'municipal_audit_log',
            documentId: 'new',
            after: params.metadata,
            source: 'function',
            riskScore: 10
        });
    } catch (e) {
        logger.error(`[MUNI_AUDIT_ERROR] Failed:`, e);
    }
}
