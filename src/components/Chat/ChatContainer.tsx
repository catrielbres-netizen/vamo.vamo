'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc 
} from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { RideChatMessage, Ride } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ChatContainerProps {
    ride: Ride;
    role: 'passenger' | 'driver' | 'admin';
    onClose?: () => void;
}

export function ChatContainer({ ride, role, onClose }: ChatContainerProps) {
    const firestore = useFirestore();
    const firebaseApp = useFirebaseApp();
    const [messages, setMessages] = useState<RideChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const isReadOnly = ['completed', 'cancelled'].includes(ride.status) || role === 'admin';
    const rideId = ride.id as string;

    // 1. Suscripción a mensajes en tiempo real
    useEffect(() => {
        if (!firestore || !rideId) return;

        const messagesRef = collection(firestore, 'rides', rideId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as RideChatMessage));
            setMessages(msgs);
            
            // Auto-scroll al final después de recibir mensajes
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 100);
        }, (error) => {
            console.error("[CHAT] Error en suscripción a mensajes:", error);
            // Si hay un error de permisos, es probable que el driver aún no esté 'asignado' oficialmente en el doc
        });

        return () => unsubscribe();
    }, [firestore, rideId]);

    // 2. Marcar como leído al abrir o recibir mensajes (si no es admin)
    useEffect(() => {
        if (role === 'admin' || !firebaseApp || !rideId) return;
        
        const markRead = async () => {
            const functions = getFunctions(firebaseApp, 'us-central1');
            const markRideMessagesReadV1 = httpsCallable(functions, 'markRideMessagesReadV1');
            try {
                await markRideMessagesReadV1({ rideId });
            } catch (e) {
                console.warn("[CHAT] No se pudo marcar como leído:", e);
            }
        };

        markRead();
    }, [firebaseApp, rideId, role, messages.length]);

    // 3. Enviar mensaje
    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputText.trim() || isSending || isReadOnly || !firebaseApp) return;

        setIsSending(true);
        const text = inputText.trim();
        setInputText('');

        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            const sendRideMessageV1 = httpsCallable(functions, 'sendRideMessageV1');
            await sendRideMessageV1({ rideId, text });
        } catch (error: any) {
            console.error("[CHAT] Error enviando mensaje:", error);
            // Restaurar texto si falló
            setInputText(text);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full max-h-[60vh] bg-zinc-950/90 border border-white/5 rounded-[2rem] overflow-hidden backdrop-blur-xl">
            {/* Header del Chat */}
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-zinc-900/50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        <VamoIcon name="message-square" className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-xs font-black uppercase tracking-widest text-white">Chat del Viaje</h4>
                        <p className="text-[9px] text-zinc-500 font-bold uppercase italic">
                            {isReadOnly ? 'Historial (Solo Lectura)' : 'Comunicación Segura'}
                        </p>
                    </div>
                </div>
                {onClose && (
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8 text-zinc-600 hover:text-white">
                        <VamoIcon name="x" className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Lista de Mensajes */}
            <div 
                className="flex-1 overflow-y-auto p-4 custom-scrollbar" 
                ref={scrollRef}
            >
                <div className="flex flex-col gap-3 min-h-full justify-end">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30">
                            <VamoIcon name="message-circle" className="w-10 h-10 mb-2" />
                            <span className="text-[10px] font-black uppercase tracking-tighter text-center">No hay mensajes aún</span>
                        </div>
                    )}
                    {messages.map((msg) => {
                        const isMe = (role === 'passenger' && msg.senderRole === 'passenger') || 
                                     (role === 'driver' && msg.senderRole === 'driver');
                        
                        return (
                            <div 
                                key={msg.id}
                                className={cn(
                                    "flex flex-col max-w-[85%] group",
                                    isMe ? "ml-auto items-end" : "mr-auto items-start"
                                )}
                            >
                                <div className={cn(
                                    "px-4 py-2.5 rounded-2xl text-sm font-medium transition-all group-hover:scale-[1.02]",
                                    isMe 
                                        ? "bg-primary text-primary-foreground rounded-br-none" 
                                        : "bg-zinc-800 text-zinc-200 rounded-bl-none border border-white/5"
                                )}>
                                    {msg.text}
                                </div>
                                <span className="text-[8px] mt-1 text-zinc-600 font-bold uppercase tracking-widest px-1">
                                    {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm', { locale: es }) : '...'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Input de Mensajes */}
            {!isReadOnly && (
                <form onSubmit={handleSend} className="p-4 border-t border-white/5 bg-zinc-900/30">
                    <div className="flex gap-2 items-center">
                        <Input 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Escribe un mensaje..."
                            className="bg-zinc-900/50 border-white/5 rounded-2xl h-12 text-sm focus-visible:ring-primary/30"
                            disabled={isSending}
                        />
                        <Button 
                            type="submit" 
                            disabled={isSending || !inputText.trim()}
                            size="icon"
                            className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground shrink-0 shadow-lg shadow-primary/10 active:scale-95 transition-transform"
                        >
                            {isSending ? (
                                <VamoIcon name="loader" className="w-5 h-5 animate-spin" />
                            ) : (
                                <VamoIcon name="send" className="w-5 h-5" />
                            )}
                        </Button>
                    </div>
                    <p className="text-[9px] text-zinc-600 font-bold italic mt-2 px-1">
                        * Toda comunicación es monitoreada por seguridad.
                    </p>
                </form>
            )}
        </div>
    );
}
