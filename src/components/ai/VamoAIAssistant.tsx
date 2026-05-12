
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Trash2, Bot, User } from 'lucide-react';
import { useVamoIA, Message } from '@/hooks/useVamoIA';
import { VamoTaxiBot } from '../VamoTaxiBot';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Card } from '../ui/card';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';

export function VamoAIAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const { messages, sendMessage, isLoading, clearChat } = useVamoIA();
    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll al final cuando hay mensajes nuevos
    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;
        const msg = inputValue;
        setInputValue('');
        await sendMessage(msg);
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className="mb-4 w-[90vw] max-w-[400px] shadow-2xl"
                    >
                        <Card className="flex h-[500px] flex-col overflow-hidden border-blue-500/20 bg-slate-950/90 backdrop-blur-xl">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-white/10 bg-blue-600/10 p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20">
                                        <VamoTaxiBot className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white">Asistente VamO</h3>
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                                            <span className="text-[10px] text-slate-400">En línea</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={clearChat}
                                        className="h-8 w-8 text-slate-400 hover:text-red-400"
                                        title="Limpiar chat"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => setIsOpen(false)}
                                        className="h-8 w-8 text-slate-400 hover:text-white"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Chat Content */}
                            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                                <div className="flex flex-col gap-4">
                                    {messages.map((msg) => (
                                        <div 
                                            key={msg.id}
                                            className={cn(
                                                "flex w-full gap-2",
                                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                                            )}
                                        >
                                            <Avatar className={cn(
                                                "h-8 w-8 border",
                                                msg.role === 'user' ? "border-blue-500/30" : "border-slate-700 bg-slate-900"
                                            )}>
                                                {msg.role === 'assistant' ? (
                                                    <div className="p-1"><VamoTaxiBot /></div>
                                                ) : (
                                                    <AvatarFallback className="bg-blue-600 text-[10px] text-white">YO</AvatarFallback>
                                                )}
                                            </Avatar>
                                            <div className={cn(
                                                "max-w-[80%] rounded-2xl p-3 text-sm",
                                                msg.role === 'user' 
                                                    ? "bg-blue-600 text-white" 
                                                    : "bg-white/5 text-slate-200 border border-white/5"
                                            )}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="flex gap-2">
                                            <Avatar className="h-8 w-8 border border-slate-700 bg-slate-900">
                                                <div className="p-1"><VamoTaxiBot /></div>
                                            </Avatar>
                                            <div className="flex items-center gap-1 rounded-2xl bg-white/5 p-3 text-slate-400">
                                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '0ms' }} />
                                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '150ms' }} />
                                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>

                            {/* Input Area */}
                            <div className="border-t border-white/10 p-4">
                                <form 
                                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                    className="flex gap-2"
                                >
                                    <Input 
                                        placeholder="Escribe tu duda..."
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                                        disabled={isLoading}
                                    />
                                    <Button 
                                        type="submit" 
                                        size="icon" 
                                        disabled={isLoading || !inputValue.trim()}
                                        className="bg-blue-600 hover:bg-blue-500"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </form>
                                <p className="mt-2 text-center text-[10px] text-slate-500">
                                    VamO AI puede cometer errores. Verificá información crítica.
                                </p>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bubble Button */}
            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-full shadow-2xl transition-colors",
                    isOpen ? "bg-slate-900 text-white" : "bg-blue-600 text-white"
                )}
            >
                {isOpen ? <X className="h-8 w-8" /> : <VamoTaxiBot className="h-12 w-12" />}
            </motion.button>
        </div>
    );
}
