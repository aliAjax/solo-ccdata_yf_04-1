import type { Take } from './types';

const PEAK_BUCKETS = 56;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t));
}

function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / buckets));
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    const start = i * block;
    for (let j = start; j < Math.min(start + block, data.length); j += 8) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  if (max > 0) return peaks.map(p => p / max);
  return peaks;
}

/** Map a getUserMedia / recording error to a clear Chinese message. */
export function describeMicError(err: unknown): string {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return '当前环境不支持录音：请通过 localhost 或 HTTPS 访问，并使用较新的浏览器。';
  }
  if (typeof MediaRecorder === 'undefined') {
    return '当前浏览器不支持 MediaRecorder 录音，请换用 Chrome、Edge 或 Firefox。';
  }
  const name = (err as DOMException | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '麦克风权限被拒绝。请点击浏览器地址栏左侧的锁形图标，将麦克风设为“允许”后重试。';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '没有检测到麦克风设备。请连接麦克风后重试。';
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风正被其他应用占用，请关闭占用它的程序后重试。';
    case 'OverconstrainedError':
      return '麦克风不满足录音参数要求，请更换设备后重试。';
    case 'NotSupportedError':
      return '当前环境不支持录音：请通过 HTTPS 或 localhost 访问，并使用较新的浏览器。';
    default:
      return `录音启动失败：${(err as Error | null)?.message ?? '未知错误'}`;
  }
}

export class Recorder {
  analyser: AnalyserNode | null = null;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('getUserMedia unavailable', 'NotSupportedError');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    try {
      this.ctx = new AudioContext();
      // Some browsers start the context suspended until resumed inside a
      // user gesture — start() is always called from a click.
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      const source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);
      const mimeType = pickMimeType();
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.start(200);
    } catch (err) {
      this.dispose();
      throw err;
    }
  }

  /** Stop and produce the take. `fallbackDuration` (seconds) is used if decoding fails. */
  async stop(fallbackDuration: number): Promise<Take> {
    const mr = this.mediaRecorder;
    if (!mr) throw new Error('录音尚未开始');
    const mimeType = mr.mimeType || 'audio/webm';
    await new Promise<void>(resolve => {
      mr.onstop = () => resolve();
      if (mr.state === 'inactive') resolve();
      else mr.stop();
    });
    const blob = new Blob(this.chunks, { type: mimeType });

    let duration = fallbackDuration;
    let peaks: number[] = [];
    try {
      const raw = await blob.arrayBuffer();
      const decodeCtx = this.ctx ?? new AudioContext();
      const audio = await decodeCtx.decodeAudioData(raw);
      if (audio.duration > 0) duration = audio.duration;
      peaks = computePeaks(audio, PEAK_BUCKETS);
    } catch {
      peaks = [];
    }

    this.dispose();
    return { blob, url: URL.createObjectURL(blob), duration, peaks, mimeType };
  }

  /** Abort without producing a take. */
  dispose(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    } catch {
      /* already stopped */
    }
    this.mediaRecorder = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.analyser = null;
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    this.ctx = null;
  }
}
