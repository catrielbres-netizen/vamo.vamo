// @/lib/speak.ts
'use client';

export function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.log('Speech synthesis no soportado o no disponible.');
    return;
  }

  const synth = window.speechSynthesis;

  // Si ya está hablando, no interrumpir para cosas menos importantes
  // pero para un nuevo viaje, sí queremos interrumpir.
  if (synth.speaking) {
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Intentar usar una voz en español si está disponible
  const voices = synth.getVoices();
  const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
  if (spanishVoice) {
    utterance.voice = spanishVoice;
  }
  
  utterance.lang = 'es-AR';
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  // Asegurarse de que las voces se carguen antes de hablar
  if (voices.length === 0) {
    synth.onvoiceschanged = () => {
        const updatedVoices = synth.getVoices();
        const updatedSpanishVoice = updatedVoices.find(voice => voice.lang.startsWith('es'));
        if (updatedSpanishVoice) {
            utterance.voice = updatedSpanishVoice;
        }
        synth.speak(utterance);
    };
  } else {
    synth.speak(utterance);
  }
}
