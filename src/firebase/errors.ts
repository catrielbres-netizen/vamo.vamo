'use client';

type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

/**
 * Builds the final, formatted error message.
 * @param context The context of the failed Firestore operation.
 * @returns A string containing the error message.
 */
function buildErrorMessage(context: SecurityRuleContext): string {
  const operation = context.operation.toUpperCase();
  const path = `/databases/(default)/documents/${context.path}`;
  return `Missing or insufficient permissions for ${operation} on path: ${path}`;
}

/**
 * A custom error class designed to be consumed for debugging.
 * It provides clear context about a failed Firestore operation due to security rules.
 */
export class FirestorePermissionError extends Error {
  public readonly context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    super(buildErrorMessage(context));
    this.name = 'FirebaseError';
    this.context = context;
  }
}
