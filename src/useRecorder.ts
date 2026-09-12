import { useCallback, useEffect, useRef, useState } from 'react';
import type { Take } from './types';
import { Recorder, describeMicError } from './recorder';

export type MicState = 'idle' | 'recording' | 'ready';

export interface RecorderControls {
  micState: MicState;
  /** seconds, updates ~10x/s while recording */
  elapsed: number;
  error: string | null;
  analyser: AnalyserNode | null;
  /** the finished, unsaved take */
  take: Take | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => void;
  discardTake: () => void;
  clearError: () => void;
}

export function useRecorder(): RecorderControls {
  const [micState, setMicState] = useState<MicState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [take, setTake] = useState<Take | null>(null);

  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const startAtRef = useRef(0);

  const revokeTake = useCallback((t: Take | null) => {
    if (t) URL.revokeObjectURL(t.url);
  }, []);

  const discardTake = useCallback(() => {
    setTake(prev => {
      revokeTake(prev);
      return null;
    });
    setMicState('idle');
  }, [revokeTake]);

  const start = useCallback(async () => {
    setError(null);
    // A previous unsaved take is replaced by the new recording.
    setTake(prev => {
      revokeTake(prev);
      return null;
    });
    const recorder = new Recorder();
    try {
      await recorder.start();
    } catch (err) {
      recorder.dispose();
      setError(describeMicError(err));
      setMicState('idle');
      return;
    }
    recorderRef.current = recorder;
    setAnalyser(recorder.analyser);
    startAtRef.current = performance.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((performance.now() - startAtRef.current) / 1000);
    }, 100);
    setMicState('recording');
  }, [revokeTake]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    window.clearInterval(timerRef.current);
    const fallback = (performance.now() - startAtRef.current) / 1000;
    try {
      const t = await recorder.stop(fallback);
      setAnalyser(null);
      setElapsed(t.duration);
      setTake(t);
      setMicState('ready');
    } catch (err) {
      setAnalyser(null);
      setMicState('idle');
      setError(describeMicError(err));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /** Abort an in-progress recording without keeping the take. */
  const cancel = useCallback(() => {
    window.clearInterval(timerRef.current);
    recorderRef.current?.dispose();
    recorderRef.current = null;
    setAnalyser(null);
    setElapsed(0);
    setMicState('idle');
  }, []);

  // Cleanup on unmount: stop mic tracks, timer, object URLs.
  useEffect(() => {
    return () => {
      window.clearInterval(timerRef.current);
      recorderRef.current?.dispose();
      recorderRef.current = null;
      setTake(prev => {
        revokeTake(prev);
        return null;
      });
    };
  }, [revokeTake]);

  return { micState, elapsed, error, analyser, take, start, stop, cancel, discardTake, clearError };
}
