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
    
    // Explicitly resume context for browsers that start in 'suspended' state
    if (ctx.state === 'suspended') {
      ctx.resume().catch(e => console.warn('[SOUND] Could not resume audio context:', e));
    }

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
 */
export function announceNewRide(originAddress?: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const speak = () => {
    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      const text = originAddress ? `Nuevo viaje. Desde ${originAddress}` : 'Nuevo viaje disponible';
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-AR';
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[TTS] Speech synthesis failed:', e);
    }
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
    setTimeout(() => { if (!window.speechSynthesis.speaking) speak(); }, 800);
  } else {
    speak();
  }
}

let nextelInterval: any = null;

/**
 * Starts a persistent "Nextel-style" rhythmic alert loop.
 */
export function startNextelLoop(): void {
  if (typeof window === 'undefined' || nextelInterval) return;
  
  const playChirp = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playPulse = (start: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.6, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
        osc.start(start);
        osc.stop(start + 0.15);
      };
      playPulse(ctx.currentTime, 800);
      playPulse(ctx.currentTime + 0.1, 1000);
    } catch (e) {
      console.warn('[SOUND] Loop chirp failed:', e);
    }
  };

  playChirp();
  nextelInterval = setInterval(playChirp, 3000);
}

/**
 * Stops the persistent alert loop.
 */
export function stopNextelLoop(): void {
  if (nextelInterval) {
    clearInterval(nextelInterval);
    nextelInterval = null;
  }
}

/** @deprecated Use playOfferSound() instead */
export const notificationSoundUri = '';
