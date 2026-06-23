// Mock for firebase-functions/v2/https
export class HttpsError extends Error {
    constructor(public code: string, message: string, public details?: any) {
        super(message);
        this.name = 'HttpsError';
    }
}
export const onCall = (opts: any, handler: any) => handler;
