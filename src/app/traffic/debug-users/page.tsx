import React from 'react';
import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Force dynamic rendering to prevent Next.js from caching the database output at build time
export const dynamic = 'force-dynamic';

function initFirebase() {
    if (admin.apps.length === 0) {
        const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('[DEBUG_USERS] Initialized with local service account.');
        } else {
            admin.initializeApp();
            console.log('[DEBUG_USERS] Initialized with default credentials.');
        }
    }
}

export default async function DebugUsersPage() {
    initFirebase();
    const db = admin.firestore();

    let errorMsg = null;
    let usersList: any[] = [];

    try {
        const allowedRoles = [
            'traffic',
            'traffic_admin',
            'traffic_operator',
            'traffic_municipal',
            'admin_municipal',
            'municipal_admin',
            'operator_municipal',
            'treasury_municipal',
            'auditor_municipal',
            'station_operator',
            'admin',
            'superadmin'
        ];

        const snap = await db.collection('users').get();
        snap.forEach(doc => {
            const data = doc.data();
            const email = data.email || '';
            const role = data.role || '';
            
            // Match allowed roles, or emails containing transito/muni
            if (
                allowedRoles.includes(role) || 
                email.toLowerCase().includes('transito') || 
                email.toLowerCase().includes('muni') ||
                email.toLowerCase().includes('inspector')
            ) {
                usersList.push({
                    uid: doc.id,
                    email: data.email || 'Sin email',
                    name: data.name || 'Sin nombre',
                    role: data.role || 'Sin rol',
                    city: data.city || data.cityKey || 'No asignada',
                });
            }
        });

        // Sort by role then email
        usersList.sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));

    } catch (e: any) {
        errorMsg = e.message;
    }

    return (
        <main className="min-h-screen bg-[#050505] text-white p-8 font-sans selection:bg-indigo-500/30">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="border-b border-white/10 pb-6">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-indigo-500">
                        Buscador de Cuentas de Tránsito / Municipales
                    </h1>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mt-2">
                        Consulta en tiempo real de la base de datos de producción
                    </p>
                </div>

                {errorMsg && (
                    <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wide">
                        Error al consultar la base de datos: {errorMsg}
                    </div>
                )}

                <div className="bg-zinc-950/50 border border-white/5 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
                    <div className="px-6 py-4 bg-zinc-900/50 border-b border-white/5 flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Cuentas Detectadas ({usersList.length})
                        </span>
                        <span className="px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-[8px] font-black tracking-widest uppercase">
                            Producción Live
                        </span>
                    </div>

                    {usersList.length === 0 ? (
                        <div className="p-12 text-center text-sm text-zinc-500 uppercase font-bold tracking-widest">
                            No se encontraron usuarios de tránsito o municipales en Firestore.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-zinc-500 bg-black/20">
                                        <th className="p-4">Nombre / Agente</th>
                                        <th className="p-4">Email</th>
                                        <th className="p-4">Rol Firestore</th>
                                        <th className="p-4">Jurisdicción</th>
                                        <th className="p-4">UID</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-xs font-medium text-zinc-300">
                                    {usersList.map((u) => (
                                        <tr key={u.uid} className="hover:bg-white/5 transition-all">
                                            <td className="p-4 font-bold text-white uppercase tracking-wider">{u.name}</td>
                                            <td className="p-4 font-mono text-zinc-400 selection:bg-indigo-500/20">{u.email}</td>
                                            <td className="p-4">
                                                <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-wider">
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="p-4 font-bold uppercase tracking-widest text-[10px] text-zinc-400">{u.city}</td>
                                            <td className="p-4 font-mono text-[9px] text-zinc-600">{u.uid}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 text-[9px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">
                    ⚠️ Esta ruta de depuración es temporal. Una vez que encuentres tu email y puedas loguearte correctamente, eliminaremos esta pantalla para mantener la seguridad de producción de VamO.
                </div>
            </div>
        </main>
    );
}
