// @/lib/sounds.ts

// Simple notification sound (sine wave), public domain.
// Encoded as a Base64 data URI to avoid needing to host a file.
/**
 * Plays a loud, attention-grabbing double beep using the Web Audio API.
 * Does not require any audio file assets.
 */
export function playOfferSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playBeep = (startTime: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.8, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playBeep(ctx.currentTime, 880, 0.2);
    playBeep(ctx.currentTime + 0.25, 1100, 0.3);
  } catch (e) {
    console.warn('[SOUND] Web Audio API not available:', e);
  }
}

/**
 * Announces a new ride offer via the browser's Text-to-Speech (Web Speech API).
 * Waits for voices to load and resumes any paused synthesis (important on Chrome Android
 * where synthesis can be paused when the tab loses focus).
 */
export function announceNewRide(originAddress?: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const speak = () => {
    try {
      window.speechSynthesis.cancel();
      // Resume if paused (Chrome Android pauses when tab is not focused)
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      const text = originAddress
        ? `Nuevo viaje. Desde ${originAddress}`
        : 'Nuevo viaje disponible';
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-AR';
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      // Pick a Spanish voice if available
      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es'));
      if (esVoice) utterance.voice = esVoice;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[TTS] Speech synthesis failed:', e);
    }
  };

  // If voices aren't loaded yet, wait for them
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
    // Fallback: if event never fires (some browsers), try after 500ms
    setTimeout(() => {
      if (!window.speechSynthesis.speaking) speak();
    }, 500);
  } else {
    speak();
  }
}

/** @deprecated Use playOfferSound() instead */
export const notificationSoundUri = '';
