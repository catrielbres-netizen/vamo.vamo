// Mock for firebase-admin/firestore
export class Timestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new Timestamp(Math.floor(Date.now() / 1000), 0); }
    static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
    toDate() { return new Date(this.seconds * 1000); }
}
export const FieldValue = {
    serverTimestamp: () => ({ _serverTimestamp: true }),
    delete: () => ({ _delete: true }),
    increment: (n: number) => ({ _increment: n }),
    arrayUnion: (...args: any[]) => ({ _arrayUnion: args }),
    arrayRemove: (...args: any[]) => ({ _arrayRemove: args }),
};
