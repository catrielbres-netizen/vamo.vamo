'use client';

import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { useToast } from '@/hooks/use-toast';
import { PUBLIC_BASE_URL } from '@/config/urls';
import { useUser } from '@/firebase/auth/use-user';

export default function MayorQRPage() {
    const qrRef = useRef<SVGSVGElement>(null);
    const { profile } = useUser();

    const downloadQR = () => {
        if (!qrRef.current) return;
        const svgData = new XMLSerializer().serializeToString(qrRef.current);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            const pngFile = canvas.toDataURL("image/png");
            const downloadLink = document.createElement("a");
            downloadLink.download = `Vamo_${profile?.city || 'Muni'}_QR.png`;
            downloadLink.href = pngFile;
            downloadLink.click();
        };
        img.src = "data:image/svg+xml;base64," + btoa(svgData);
    };

    // URL to go to login. Using window.origin or a default
    const loginUrl = `${PUBLIC_BASE_URL}/login`;

    return (
        <div className="min-h-screen bg-[#050508] flex flex-col items-center justify-center p-6 font-sans">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-1000">
                {/* Logo & Title */}
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-indigo-500/20 rotate-3 transition-transform hover:rotate-0 duration-500">
                        <VamoIcon name="shield-check" className="w-10 h-10 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Acceso Institucional</h1>
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.3em] mt-2">Municipalidad de {profile?.city || 'VamO'}</p>
                    </div>
                </div>

                <Card className="bg-white/[0.03] border-white/10 rounded-[40px] overflow-hidden shadow-2xl backdrop-blur-xl">
                    <CardContent className="p-10 flex flex-col items-center gap-8">
                        <div className="p-6 bg-white rounded-[32px] shadow-[0_0_50px_rgba(255,255,255,0.1)]">
                            <QRCodeSVG 
                                ref={qrRef}
                                value={loginUrl} 
                                size={220}
                                level="H"
                                includeMargin={false}
                                imageSettings={{
                                    src: "/branding/vamo-logo.png", // [VamO PRO] Local branding asset
                                    x: undefined,
                                    y: undefined,
                                    height: 40,
                                    width: 40,
                                    excavate: true,
                                }}
                            />
                        </div>

                        <div className="text-center space-y-2">
                            <h2 className="text-lg font-black text-white">Escanee para Ingresar</h2>
                            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest leading-relaxed">
                                Este código lo dirigirá directamente al portal de gestión de transporte de VamO.
                            </p>
                        </div>

                        <div className="w-full pt-4 space-y-3">
                            <Button 
                                onClick={downloadQR}
                                className="w-full h-14 bg-white text-black hover:bg-zinc-200 font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <VamoIcon name="download" className="w-5 h-5" />
                                DESCARGAR QR OFICIAL
                            </Button>
                            <p className="text-[9px] text-zinc-700 font-bold uppercase tracking-[0.2em] text-center italic">
                                Solo para uso de autoridades municipales autorizadas
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Footer Footer */}
                <div className="flex flex-col items-center gap-2 opacity-30">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Servidor de Enlace Activo</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 font-bold">VamO Governance Suite v2.4</p>
                </div>
            </div>
        </div>
    );
}
