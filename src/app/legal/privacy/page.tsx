'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Shield } from 'lucide-react';
import { PrivacyPolicyText } from '@/components/legal/LegalTexts';

export default function PrivacyPolicyPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 pb-20">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-zinc-400 hover:text-white">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-sm font-black uppercase tracking-widest text-white">Política de Privacidad</h1>
            </div>

            <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
                {/* Intro Section */}
                <div className="space-y-4">
                    <div className="h-16 w-16 bg-primary/10 rounded-[2rem] flex items-center justify-center border border-primary/20 mb-6">
                        <Shield className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Política de Privacidad de <span className="text-primary not-italic">VamO</span></h2>
                    <p className="text-zinc-500 font-medium">Última actualización: Abril 2026</p>
                </div>

                {/* Content */}
                <div className="p-6 bg-zinc-900/50 border border-white/5 rounded-[2.5rem] shadow-xl">
                    <PrivacyPolicyText />
                </div>
            </div>
        </div>
    );
}
