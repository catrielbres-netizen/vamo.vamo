import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { SharedSeatSelector, SeatId } from '@/components/shared-ride/SharedSeatSelector';

interface SharedRideSuggestionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    individualFare: number;
    sharedFareEstimate: number;
    savingsAmount: number;
    passengerCount: number;
    maxPassengers?: number;
    onJoin: () => void;
    onContinueIndividual: () => void;
    isLoading: boolean;
    suggestingForSharedMode?: boolean;
    // Seat props
    selectedSeats: SeatId[];
    onSeatsChange: (seats: SeatId[]) => void;
    occupiedSeats?: SeatId[];
}

export function SharedRideSuggestionModal({
    open,
    onOpenChange,
    individualFare,
    sharedFareEstimate,
    savingsAmount,
    passengerCount,
    maxPassengers = 2,
    onJoin,
    onContinueIndividual,
    isLoading,
    suggestingForSharedMode = false,
    selectedSeats,
    onSeatsChange,
    occupiedSeats = [],
}: SharedRideSuggestionModalProps) {
    const baseFare = Math.round((individualFare * 0.60) / 100) * 100;
    const seatMultiplier = selectedSeats.length >= 2 ? 1.10 : 1.00;
    const previewFare = Math.round((baseFare * seatMultiplier) / 100) * 100;
    const previewSaving = individualFare - previewFare;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md w-[95vw] rounded-3xl bg-zinc-950 border border-emerald-500/30 p-0 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-br from-emerald-900/40 to-zinc-950 p-6 flex flex-col gap-5">
                    <DialogHeader className="text-left space-y-3">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40 mb-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                            <VamoIcon name="users" className="w-6 h-6 text-emerald-400" />
                        </div>
                        <DialogTitle className="text-xl font-black text-white uppercase tracking-tight leading-tight">
                            {suggestingForSharedMode ? "Ya hay un VamO Compartido cerca" : "Hay un VamO Compartido compatible"}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-zinc-300 font-medium leading-relaxed">
                            {suggestingForSharedMode
                                ? "Elegí tus asientos y unite al grupo que ya se está formando."
                                : "Elegí tus asientos y pagá menos sumándote al grupo."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Seat Selector */}
                    <SharedSeatSelector
                        selectedSeats={selectedSeats}
                        onSeatsChange={onSeatsChange}
                        occupiedSeats={occupiedSeats}
                    />

                    {/* Price preview */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Viaje Individual</span>
                            <span className="text-sm font-black text-zinc-300 line-through decoration-red-500/50">${individualFare.toLocaleString('es-AR')}</span>
                        </div>

                        <div className="relative flex items-center justify-between p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 shadow-inner overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none" />
                            <div className="flex flex-col gap-1 z-10">
                                <span className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <VamoIcon name="zap" className="w-3 h-3" />
                                    {selectedSeats.length === 0 ? 'Seleccioná asientos' : selectedSeats.length === 1 ? 'Tu precio (1 asiento)' : 'Tu precio (vos + acompañante)'}
                                </span>
                                {selectedSeats.length > 0 && (
                                    <span className="text-xs text-emerald-200/70 font-medium">Ahorrás <span className="font-bold text-emerald-400">${previewSaving.toLocaleString('es-AR')}</span></span>
                                )}
                            </div>
                            <span className="text-2xl font-black text-white z-10 drop-shadow-md">
                                {selectedSeats.length === 0 ? '—' : `$${previewFare.toLocaleString('es-AR')}`}
                            </span>
                        </div>
                    </div>

                    {/* Group Info */}
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="flex -space-x-2">
                            {Array.from({ length: passengerCount }).map((_, i) => (
                                <div key={i} className="w-7 h-7 rounded-full bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center relative z-10">
                                    <VamoIcon name="user" className="w-3.5 h-3.5 text-zinc-400" />
                                </div>
                            ))}
                            {Array.from({ length: Math.max(0, maxPassengers - passengerCount) }).map((_, i) => (
                                <div key={`empty-${i}`} className="w-7 h-7 rounded-full bg-zinc-900 border-2 border-zinc-950 border-dashed flex items-center justify-center opacity-50">
                                    <VamoIcon name="user" className="w-3.5 h-3.5 text-zinc-600" />
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-white/90">Grupo activo ({passengerCount}/{maxPassengers})</span>
                            <span className="text-[10px] text-zinc-500">Máx. {maxPassengers} pasajeros registrados.</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 mt-2">
                        <Button
                            onClick={onJoin}
                            disabled={isLoading || selectedSeats.length === 0}
                            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                        >
                            {isLoading
                                ? <VamoIcon name="loader" className="w-4 h-4 animate-spin" />
                                : selectedSeats.length === 0
                                    ? 'Seleccioná al menos 1 asiento'
                                    : (suggestingForSharedMode ? "Unirme a ese grupo" : "Unirme al VamO Compartido")}
                        </Button>
                        <Button
                            onClick={onContinueIndividual}
                            disabled={isLoading}
                            variant="ghost"
                            className="w-full h-12 hover:bg-white/5 text-zinc-400 hover:text-white rounded-xl font-bold text-xs uppercase tracking-wider"
                        >
                            {suggestingForSharedMode ? "Crear otro grupo" : "Seguir con viaje individual"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
