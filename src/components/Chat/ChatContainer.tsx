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

    // 1. Suscripción a mensajes en tiempo real y Sonido
    const isInitialLoad = useRef(true);
    const audioCtxRef = useRef<AudioContext | any>(null);

    useEffect(() => {
        const initAudio = () => {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            if (audioCtxRef.current.state === 'suspended') {
                audioCtxRef.current.resume();
            }
        };
        
        window.addEventListener('click', initAudio, { once: true });
        window.addEventListener('touchstart', initAudio, { once: true });
        
        return () => {
            window.removeEventListener('click', initAudio);
            window.removeEventListener('touchstart', initAudio);
        };
    }, []);

    const playNotificationSound = () => {
        try {
            const audioCtx = audioCtxRef.current;
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            const now = audioCtx.currentTime;
            const playPulse = (startTime: number) => {
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                osc.type = 'triangle'; // Richer harmonics than sine
                osc.frequency.setValueAtTime(1100, startTime);
                osc.frequency.exponentialRampToValueAtTime(1400, startTime + 0.04);
                
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.06);
                
                osc.start(startTime);
                osc.stop(startTime + 0.08);
            };

            // Double chirp "Nextel" style
            playPulse(now);
            playPulse(now + 0.1);
        } catch (e) {
            console.warn("[CHAT] Audio notification failed", e);
        }
    };

    useEffect(() => {
        if (!firestore || !rideId) return;

        console.log('[CHAT_MOUNT]', { rideId, role });

        const messagesRef = collection(firestore, 'rides', rideId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as RideChatMessage));

            console.log('[CHAT_SNAPSHOT]', { 
                rideId, 
                count: msgs.length,
                isInitial: isInitialLoad.current 
            });

            if (!isInitialLoad.current) {
                const added = snapshot.docChanges().filter(c => c.type === 'added');
                const newFromOther = added.some(c => c.doc.data().senderRole !== role);
                if (newFromOther) {
                    playNotificationSound();
                }
            }

            setMessages(msgs);
            
            // Auto-scroll al final después de recibir mensajes
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 100);

            if (isInitialLoad.current) {
                isInitialLoad.current = false;
            }
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
                className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar scroll-smooth" 
                ref={scrollRef}
            >
                <div className="flex flex-col gap-4 min-h-full justify-end">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
                            <div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center mb-4 border border-white/5">
                                <VamoIcon name="message-circle" className="w-8 h-8 text-zinc-700" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-center text-zinc-600">Comenzar conversación</span>
                        </div>
                    )}
                    {messages.map((msg) => {
                        const isMe = (role === 'passenger' && msg.senderRole === 'passenger') || 
                                     (role === 'driver' && msg.senderRole === 'driver');
                        
                        return (
                            <div 
                                key={msg.id}
                                className={cn(
                                    "flex flex-col max-w-[80%] animate-in fade-in slide-in-from-bottom-2 duration-300",
                                    isMe ? "ml-auto items-end" : "mr-auto items-start"
                                )}
                            >
                                <div className={cn(
                                    "px-4 py-3 rounded-2xl text-[13px] font-medium leading-relaxed shadow-lg",
                                    isMe 
                                        ? "bg-indigo-600 text-white rounded-br-none" 
                                        : "bg-zinc-800 text-zinc-100 rounded-bl-none border border-white/10"
                                )}>
                                    {msg.text}
                                </div>
                                <span className={cn(
                                    "text-[9px] mt-1.5 font-bold uppercase tracking-widest opacity-40 px-1",
                                    isMe ? "bg-gradient-to-l from-indigo-400 to-transparent bg-clip-text text-transparent" : "text-zinc-500"
                                )}>
                                    {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm', { locale: es }) : 'Enviando...'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Input de Mensajes */}
            {!isReadOnly && (
                <form onSubmit={handleSend} className="p-4 border-t border-white/5 bg-zinc-900/50 pb-8">
                    <div className="flex gap-2 items-center bg-zinc-950/50 p-1 rounded-[1.5rem] border border-white/10 focus-within:border-indigo-500/30 transition-all">
                        <Input 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Escribe aquí..."
                            className="bg-transparent border-none focus-visible:ring-0 shadow-none h-11 text-sm text-zinc-200"
                            disabled={isSending}
                        />
                        <Button 
                            type="submit" 
                            disabled={isSending || !inputText.trim()}
                            size="icon"
                            className={cn(
                                "h-10 w-10 rounded-full shrink-0 transition-all duration-300 border-0",
                                inputText.trim() 
                                  ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20 active:scale-90" 
                                  : "bg-zinc-800/80 text-zinc-600"
                            )}
                        >
                            {isSending ? (
                                <VamoIcon name="loader" className="w-4 h-4 animate-spin" />
                            ) : (
                                <VamoIcon name="arrow-up" strokeWidth={3} className={cn("w-4 h-4 transition-all duration-200", inputText.trim() && "scale-110")} />
                            )}
                        </Button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 px-2 opacity-50">
                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">
                            Canal de comunicación encriptado
                        </p>
                    </div>
                </form>
            )}
        </div>
    );
}
