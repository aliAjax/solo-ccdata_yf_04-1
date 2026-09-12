import { useEffect, useRef } from 'react';

const BAR_COUNT = 64;
const BAR_GAP = 3;

/** Real-time waveform drawn from an AnalyserNode while recording. */
export function LiveWaveform({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    const data = new Uint8Array(analyser?.fftSize ?? 2048);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const barWidth = Math.max(2, (w - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT);
      if (analyser && active) {
        analyser.getByteTimeDomainData(data);
        const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
        ctx.fillStyle = '#2bb89d';
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += Math.abs(data[i * step + j] - 128) / 128;
          const amp = Math.min(1, (sum / step) * 2.4);
          const bh = Math.max(2, amp * (h - 4));
          ctx.fillRect(i * (barWidth + BAR_GAP), (h - bh) / 2, barWidth, bh);
        }
      } else {
        ctx.fillStyle = '#d8e2e0';
        for (let i = 0; i < BAR_COUNT; i++) {
          ctx.fillRect(i * (barWidth + BAR_GAP), h / 2 - 1, barWidth, 2);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);

  return <canvas className="live-wave" ref={canvasRef} aria-label="实时波形" />;
}

/** Static waveform rendered from decoded peaks of a finished take. */
export function PeaksWaveform({ peaks }: { peaks: number[] }) {
  return (
    <div className="peaks-wave" aria-label="录音波形">
      {peaks.map((p, i) => (
        <i key={i} style={{ height: `${Math.max(7, Math.round(p * 100))}%` }} />
      ))}
    </div>
  );
}
