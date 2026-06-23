
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Info, AlertTriangle } from 'lucide-react';

interface SharedRideLegalGateProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function SharedRideLegalGate({ isOpen, onClose, onConfirm }: SharedRideLegalGateProps) {
    const [accepted, setAccepted] = useState(false);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[90vw] sm:max-w-[420px] bg-[#1a1a1a] border-white/10 text-white rounded-[2rem] p-6 overflow-hidden">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                            <ShieldCheck className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div className="flex flex-col">
                            <DialogTitle className="text-xl font-black uppercase italic tracking-tight flex items-center gap-2">
                                VamO Compartido
                            </DialogTitle>
                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] mt-0.5">Servicio Oficial</p>
                        </div>
                    </div>
                    <DialogDescription className="text-zinc-400 text-[13px] leading-relaxed mt-2">
                        Ahorrá compartiendo el recorrido con otros pasajeros cercanos. Al elegir esta modalidad, aceptás las condiciones del servicio.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-3">
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <p className="text-[11px] font-black text-amber-500 uppercase tracking-wider">Términos de Uso</p>
                        </div>
                        <p className="text-xs text-white/70 leading-relaxed font-medium">
                            • <span className="text-white font-bold">VamO Compartido</span> puede demorar más de lo habitual debido a desvíos y esperas.<br />
                            • Si necesitás llegar a un horario puntual, te recomendamos <span className="text-white font-bold">pedir un viaje normal</span>.<br />
                            • El precio final del viaje compartido <span className="text-white font-bold">depende de la conformación final del grupo</span>.<br />
                            • <span className="text-amber-200 font-bold">Fase de Simulación</span>: En esta etapa de prueba <span className="text-amber-200 font-bold">NO se creará un viaje ni un grupo real</span> en la base de datos.
                        </p>
                    </div>

                    <div className="flex items-start space-x-3 p-4 rounded-2xl bg-white/5 border border-white/5">
                        <Checkbox 
                            id="shared-ride-gate" 
                            checked={accepted} 
                            onCheckedChange={(checked) => setAccepted(checked === true)}
                            className="mt-1 border-white/20 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                        />
                        <Label 
                            htmlFor="shared-ride-gate" 
                            className="text-[12px] font-medium leading-tight text-zinc-400 cursor-pointer"
                        >
                            Acepto los términos de esta prueba. Entiendo que es solo visual y que el pago final en la versión real será solo en efectivo.
                        </Label>
                    </div>

                    <div className="flex items-center gap-2 px-1 opacity-50">
                        <Info className="w-3 h-3 text-zinc-500" />
                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Pago solo efectivo en esta versión</p>
                    </div>
                </div>

                <DialogFooter className="flex flex-col gap-3 sm:flex-col pt-2">
                    <Button 
                        onClick={onConfirm} 
                        disabled={!accepted}
                        className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-900/20 active:scale-[0.98] transition-all"
                    >
                        Entendido y Solicitar
                    </Button>
                    <Button variant="ghost" onClick={onClose} className="w-full h-10 text-zinc-500 font-bold hover:bg-white/5">
                        Volver
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
