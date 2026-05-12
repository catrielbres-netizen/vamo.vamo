import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { logAuditAction, logLedgerEvent } from "./lib/audit";

/**
 * [VamO PRO] Audit Trigger: User Status & Balance Changes
 */
export const onUserSensitiveUpdateV1 = onDocumentUpdated("users/{userId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    const userId = event.params.userId;
    const sensitiveFields = ['isSuspended', 'approved', 'role', 'currentBalance', 'municipalStatus'];
    const changedFields = sensitiveFields.filter(field => 
        JSON.stringify(before[field]) !== JSON.stringify(after[field])
    );

    if (changedFields.length > 0) {
        await logAuditAction({
            actorId: 'system_trigger',
            actorRole: 'admin',
            action: 'USER_SENSITIVE_UPDATE',
            collection: 'users',
            documentId: userId,
            before: changedFields.reduce((acc, f) => ({ ...acc, [f]: before[f] }), {}),
            after: changedFields.reduce((acc, f) => ({ ...acc, [f]: after[f] }), {}),
            source: 'function',
            riskScore: changedFields.includes('isSuspended') || changedFields.includes('role') ? 50 : 10
        });

        // Specific ledger events
        if (before.isSuspended !== after.isSuspended) {
            await logLedgerEvent({
                eventType: after.isSuspended ? 'user_suspended' : 'user_reactivated',
                actorId: 'admin_action', // Placeholder, idealmente capturar del auth si es onCall
                actorRole: 'admin',
                targetId: userId,
                metadata: { reason: after.suspensionReason || 'No especificado' }
            });
        }
    }
});

/**
 * [VamO PRO] Audit Trigger: New User Registration
 */
export const onUserCreatedAuditV1 = onDocumentCreated("users/{userId}", async (event) => {
    const data = event.data?.data();
    if (!data) return;

    await logLedgerEvent({
        eventType: data.role === 'driver' ? 'driver_registered' : 'user_created',
        actorId: event.params.userId,
        actorRole: data.role,
        cityKey: data.cityKey || 'global',
        metadata: { name: data.name, email: data.email }
    });
});
