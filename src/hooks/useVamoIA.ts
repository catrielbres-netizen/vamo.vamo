
import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useFunctions } from '@/firebase/provider';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export function useVamoIA() {
    const functions = useFunctions();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: '¡Hola! Soy tu asistente VamO. ¿En qué puedo ayudarte hoy?',
            timestamp: Date.now()
        }
    ]);
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const askIA = httpsCallable<{ message: string, chatHistory: any[] }, { reply: string }>(
                functions, 
                'askVamoIAV1'
            );

            const result = await askIA({
                message: content,
                chatHistory: messages.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            });

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: result.data.reply,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (error) {
            console.error("VamoIA Error:", error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Lo siento, hubo un problema al conectar con mi cerebro central. Por favor, intenta de nuevo en unos momentos.',
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    }, [functions, messages]);

    const clearChat = useCallback(() => {
        setMessages([
            {
                id: 'welcome',
                role: 'assistant',
                content: '¡Hola de nuevo! ¿En qué puedo ayudarte?',
                timestamp: Date.now()
            }
        ]);
    }, []);

    return {
        messages,
        sendMessage,
        isLoading,
        clearChat
    };
}
