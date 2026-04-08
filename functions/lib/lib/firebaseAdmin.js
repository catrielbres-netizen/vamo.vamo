"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.getFunctions = exports.getMessaging = exports.getAuth = exports.getDb = void 0;
const admin = __importStar(require("firebase-admin"));
const functions_1 = require("firebase-admin/functions");
/**
 * [VamO PRO] Centralized Firebase Admin Access
 * This module ensures we only call admin.firestore() after initialization.
 * Using getters avoids module-level initialization crashes (app/no-app error).
 */
const getDb = () => admin.firestore();
exports.getDb = getDb;
const getAuth = () => admin.auth();
exports.getAuth = getAuth;
const getMessaging = () => admin.messaging();
exports.getMessaging = getMessaging;
const getFunctions = () => (0, functions_1.getFunctions)();
exports.getFunctions = getFunctions;
// Shortcut for the most common use case
const db = () => admin.firestore();
exports.db = db;
//# sourceMappingURL=firebaseAdmin.js.map