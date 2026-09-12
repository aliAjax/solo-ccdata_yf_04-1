/**
 * Global playback bus: exactly one thing plays at a time (TTS demo or a
 * recording). Components subscribe with useSyncExternalStore to render
 * play/stop state, so state stays correct even across panels.
 */

export interface NowPlaying {
  /** identifies what is playing, e.g. "demo:<phraseId>" or "rec:<recordId>" */
  key: string;
  stage: 'demo' | 'rec';
}

export interface SpeakOptions {
  voiceURI: string | null;
  rate: number;
}

let now: NowPlaying | null = null;
const listeners = new Set<() => void>();

function setNow(next: NowPlaying | null): void {
  now = next;
  listeners.forEach(fn => fn());
}

export function subscribePlayback(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getNowPlaying(): NowPlaying | null {
  return now;
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ---- voices -------------------------------------------------------------

let voices: SpeechSynthesisVoice[] = [];
const voiceListeners = new Set<() => void>();

function refreshVoices(): void {
  if (!ttsSupported()) return;
  const list = window.speechSynthesis.getVoices();
  if (list.length !== voices.length || list.some((v, i) => v.voiceURI !== voices[i]?.voiceURI)) {
    voices = list;
    voiceListeners.forEach(fn => fn());
  }
}

if (ttsSupported()) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
  // Some engines only populate after a first poll.
  setTimeout(refreshVoices, 250);
  setTimeout(refreshVoices, 1000);
}

export function subscribeVoices(fn: () => void): () => void {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
}

export function getVoices(): SpeechSynthesisVoice[] {
  return voices;
}

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  return voices.filter(v => /^en([-_]|$)/i.test(v.lang));
}

function pickVoice(voiceURI: string | null): SpeechSynthesisVoice | null {
  const english = getEnglishVoices();
  return (
    (voiceURI ? voices.find(v => v.voiceURI === voiceURI) : undefined) ??
    english.find(v => /en[-_]US/i.test(v.lang)) ??
    english[0] ??
    null
  );
}

// ---- transport ----------------------------------------------------------

let activeStop: (() => void) | null = null;

export function stopPlayback(): void {
  const stop = activeStop;
  activeStop = null;
  stop?.();
  if (ttsSupported()) window.speechSynthesis.cancel();
  setNow(null);
}

function makeUtterance(text: string, opts: SpeakOptions): SpeechSynthesisUtterance {
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(opts.voiceURI);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = 'en-US';
  }
  utter.rate = Math.min(2, Math.max(0.5, opts.rate));
  return utter;
}

/** Play the TTS demo for a phrase. Returns false when TTS is unavailable. */
export function playDemo(key: string, text: string, opts: SpeakOptions): boolean {
  stopPlayback();
  if (!ttsSupported()) return false;
  let cancelled = false;
  const utter = makeUtterance(text, opts);
  const stop = () => {
    cancelled = true;
    window.speechSynthesis.cancel();
  };
  utter.onend = utter.onerror = () => {
    if (cancelled) return;
    if (activeStop === stop) activeStop = null;
    setNow(null);
  };
  activeStop = stop;
  setNow({ key, stage: 'demo' });
  window.speechSynthesis.speak(utter);
  return true;
}

/** Play a recorded blob. */
export function playRecording(key: string, blob: Blob): void {
  stopPlayback();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const stop = () => {
    audio.pause();
    URL.revokeObjectURL(url);
  };
  audio.onended = audio.onerror = () => {
    URL.revokeObjectURL(url);
    if (activeStop === stop) activeStop = null;
    setNow(null);
  };
  activeStop = stop;
  setNow({ key, stage: 'rec' });
  void audio.play().catch(() => {
    if (activeStop === stop) activeStop = null;
    URL.revokeObjectURL(url);
    setNow(null);
  });
}

/**
 * Shadowing compare: play the TTS demo first, then the recording.
 * Falls back to playing only the recording when TTS is unavailable.
 */
export function playCompare(key: string, text: string, blob: Blob, opts: SpeakOptions): void {
  stopPlayback();
  let cancelled = false;

  const startRec = () => {
    if (cancelled) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const stopRec = () => {
      cancelled = true;
      audio.pause();
      URL.revokeObjectURL(url);
    };
    audio.onended = audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (activeStop === stopRec) activeStop = null;
      setNow(null);
    };
    activeStop = stopRec;
    setNow({ key, stage: 'rec' });
    void audio.play().catch(() => {
      if (activeStop === stopRec) activeStop = null;
      URL.revokeObjectURL(url);
      setNow(null);
    });
  };

  if (!ttsSupported() || getEnglishVoices().length === 0) {
    startRec();
    return;
  }

  const utter = makeUtterance(text, opts);
  const stopDemo = () => {
    cancelled = true;
    window.speechSynthesis.cancel();
  };
  utter.onend = utter.onerror = () => {
    if (!cancelled) startRec();
  };
  activeStop = stopDemo;
  setNow({ key, stage: 'demo' });
  window.speechSynthesis.speak(utter);
}
