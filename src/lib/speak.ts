// @/lib/speak.ts
'use client';

export function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.log('Speech synthesis no soportado o no disponible.');
    return;
  }

  const synth = window.speechSynthesis;

  // Si ya está hablando, lo cancelamos para dar prioridad al nuevo mensaje.
  if (synth.speaking) {
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Función para seleccionar la voz y hablar
  const doSpeak = () => {
    const voices = synth.getVoices();
    // Prioridad a la voz de español de Argentina, luego cualquier español.
    const spanishVoice = voices.find(voice => voice.lang === 'es-AR') || voices.find(voice => voice.lang.startsWith('es'));
    
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }
    
    utterance.lang = spanishVoice ? spanishVoice.lang : 'es';
    utterance.rate = 1;
    utterance.pitch = 1.1;
    utterance.volume = 1;

    synth.speak(utterance);
  };

  // Si las voces no se han cargado todavía, esperamos al evento onvoiceschanged.
  // Esto es crucial en muchos navegadores.
  if (synth.getVoices().length === 0) {
    synth.onvoiceschanged = () => {
      doSpeak();
    };
  } else {
    // Si ya están cargadas, hablamos directamente.
    doSpeak();
  }
}
