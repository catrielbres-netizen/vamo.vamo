import * as fs from 'fs';
import * as path from 'path';

/**
 * [VamO PRO] Multi-Package Type Synchronizer
 * 
 * Objective: Maintain a single source of truth for types in functions/src/types.ts
 * and automatically sync them to src/lib/types.ts with necessary environment adjustments.
 */

const SOURCE_PATH = './functions/src/types.ts';
const DEST_PATH = './src/lib/types.ts';

function sync() {
    console.log('🔄 Synchronizing VamO Types...');

    if (!fs.existsSync(SOURCE_PATH)) {
        console.error('❌ Source types file not found at:', SOURCE_PATH);
        return;
    }

    let content = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // 1. Convert Admin SDK imports/types to Client-agnostic types
    content = content.replace(
        "import * as admin from 'firebase-admin';",
        "// Sync-adjusted: admin import removed"
    );

    // 2. Adjust Firestore types for the frontend (which uses 'any' or client SDK types)
    // We replace the specific Firestore types with generic placeholders that the frontend defines.
    content = content.replace(
        "export type FirestoreTimestamp = admin.firestore.Timestamp;",
        "export type FirestoreTimestamp = any;"
    );
    content = content.replace(
        "export type FirestoreFieldValue = admin.firestore.FieldValue;",
        "export type FirestoreFieldValue = any;"
    );

    // 3. Add header
    const header = `/**\n * ⚠️ AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY\n * This file is synchronized from functions/src/types.ts\n * Last Sync: ${new Date().toISOString()}\n */\n\n`;
    
    fs.writeFileSync(DEST_PATH, header + content);
    console.log('✅ Types synchronized successfully to:', DEST_PATH);
}

sync();
