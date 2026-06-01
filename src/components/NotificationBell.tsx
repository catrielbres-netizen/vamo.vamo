'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, orderBy, onSnapshot, doc, writeBatch, limit, where } from 'firebase/firestore';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export interface VamoNotification {
    id: string;
    userId: string;
    role: 'passenger' | 'driver';
    type: string;
    title: string;
    message: string;
    rideId?: string;
    movementId?: string;
    chatId?: string;
    read: boolean;
    priority: 'info' | 'success' | 'warning' | 'critical';
    actionUrl?: string;
    createdAt: any;
}

interface NotificationBellProps {
    role: 'passenger' | 'driver';
    className?: string;
}

export function NotificationBell({ role, className }: NotificationBellProps) {
    const firestore = useFirestore();
    const { user } = useUser();
    const router = useRouter();
    const [notifications, setNotifications] = useState<VamoNotification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    useEffect(() => {
        if (!firestore || !user?.uid) return;

        const notifsRef = collection(firestore, `notifications/${user.uid}/items`);
        // Solo traemos las últimas 50 notificaciones del rol actual
        const q = query(notifsRef, where('role', '==', role), orderBy('createdAt', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as VamoNotification[];
            setNotifications(items);
        });

        return () => unsubscribe();
    }, [firestore, user?.uid, role]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!firestore || !user?.uid) return;
        try {
            const ref = doc(firestore, `notifications/${user.uid}/items`, id);
            const batch = writeBatch(firestore);
            batch.update(ref, { read: true });
            await batch.commit();
        } catch (error) {
            console.error("Error marking notification as read", error);
        }
    };

    const markAllAsRead = async () => {
        if (!firestore || !user?.uid) return;
        try {
            const batch = writeBatch(firestore);
            const unread = notifications.filter(n => !n.read);
            unread.forEach(n => {
                const ref = doc(firestore, `notifications/${user.uid}/items`, n.id);
                batch.update(ref, { read: true });
            });
            await batch.commit();
        } catch (error) {
            console.error("Error marking all as read", error);
        }
    };

    const handleNotificationClick = (notif: VamoNotification) => {
        markAsRead(notif.id);
        if (notif.actionUrl) {
            setIsOpen(false);
            router.push(notif.actionUrl);
        }
    };

    return (
        <div className={cn("relative z-50", className)} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
                <VamoIcon name="bell" className="w-5 h-5 text-zinc-300" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-black text-white border-2 border-zinc-950">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[80vh] bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Notificaciones</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors"
                            >
                                Marcar leídas
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                    <VamoIcon name="bell-off" className="w-5 h-5 text-zinc-600" />
                                </div>
                                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Sin notificaciones</p>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {notifications.map(notif => (
                                    <div
                                        key={notif.id}
                                        onClick={() => handleNotificationClick(notif)}
                                        className={cn(
                                            "p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group flex gap-3",
                                            !notif.read ? "bg-indigo-500/5" : ""
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border",
                                            notif.priority === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                            notif.priority === 'warning' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                                            notif.priority === 'critical' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                            "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                                        )}>
                                            <VamoIcon name={
                                                notif.type.includes('payment') ? 'credit-card' :
                                                notif.type.includes('message') ? 'message-circle' :
                                                notif.type.includes('express') ? 'zap' :
                                                notif.type.includes('ride') ? 'map-pin' :
                                                'bell'
                                            } className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={cn(
                                                    "text-sm font-bold truncate",
                                                    !notif.read ? "text-white" : "text-zinc-300"
                                                )}>
                                                    {notif.title}
                                                </p>
                                                {!notif.read && (
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1" />
                                                )}
                                            </div>
                                            <p className="text-xs text-zinc-500 line-clamp-2 leading-snug">
                                                {notif.message}
                                            </p>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mt-1">
                                                {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString() : 'Reciente'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
