import { useMemo, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, ChevronRight, Headphones, Mic, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { Phrase, PracticeRecord, Take } from '../types';
import { fmtElapsed } from '../format';
import {
  getNowPlaying,
  getVoices,
  playCompare,
  playDemo,
  playRecording,
  stopPlayback,
  subscribePlayback,
  subscribeVoices,
  ttsSupported,
} from '../playback';
import { useRecorder } from '../useRecorder';
import { LiveWaveform, PeaksWaveform } from './Waveform';
import { Stars } from './Stars';
import { RecordRow } from './RecordRow';

interface PracticePanelProps {
  phrase: Phrase;
  records: PracticeRecord[];
  voiceURI: string | null;
  rate: number;
  onVoiceChange: (uri: string | null) => void;
  onRateChange: (rate: number) => void;
  onSaveRecord: (take: Take, rating: number) => Promise<void>;
  onDeletePhrase: () => void;
  onPlayRecord: (r: PracticeRecord) => void;
  onCompareRecord: (r: PracticeRecord) => void;
  onDeleteRecord: (r: PracticeRecord) => void;
  onRateRecord: (r: PracticeRecord, rating: number) => void;
  onShowHistory: () => void;
}

export function PracticePanel(props: PracticePanelProps) {
  const { phrase, records, voiceURI, rate } = props;
  const voices = useSyncExternalStore(subscribeVoices, getVoices);
  const english = useMemo(() => voices.filter(v => /^en([-_]|$)/i.test(v.lang)), [voices]);
  const now = useSyncExternalStore(subscribePlayback, getNowPlaying);

  const demoKey = `demo:${phrase.id}`;
  const demoPlaying = now?.key === demoKey;
  const ttsOk = ttsSupported();

  const toggleDemo = () => {
    if (demoPlaying) {
      stopPlayback();
    } else {
      playDemo(demoKey, phrase.text, { voiceURI, rate });
    }
  };

  return (
    <section className="practice">
      <div className="practice-head">
        <div>
          <span className="label">CURRENT PHRASE</span>
          <h2>跟读练习</h2>
        </div>
        <button
          type="button"
          className="icon-btn"
          title="删除这个句子（连同它的录音）"
          onClick={() => {
            if (window.confirm(`删除句子「${phrase.text}」？它的 ${records.length} 条录音也会一并删除。`)) {
              props.onDeletePhrase();
            }
          }}
        >
          <Trash2 size={17} />
        </button>
      </div>

      <div className="focus-card">
        <div className="focus-tag">
          {phrase.tag} · {phrase.level}
        </div>
        <p className="focus-text">{phrase.text}</p>
        {phrase.translation && <p className="focus-translation">{phrase.translation}</p>}
        <div className="demo-controls">
          <button
            type="button"
            className="round-btn"
            onClick={toggleDemo}
            disabled={!ttsOk}
            title={ttsOk ? (demoPlaying ? '停止示范' : '播放示范') : '当前浏览器不支持语音合成'}
          >
            {demoPlaying ? <Square size={15} /> : <Play size={16} />}
          </button>
          <select
            className="voice-select"
            value={voiceURI ?? ''}
            onChange={e => props.onVoiceChange(e.target.value || null)}
            disabled={english.length === 0}
            title="示范语音"
          >
            <option value="">自动语音</option>
            {english.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}（{v.lang}）
              </option>
            ))}
          </select>
          <div className="rate-control" title="示范语速">
            <span>语速</span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={rate}
              onChange={e => props.onRateChange(Number(e.target.value))}
            />
            <b>{rate.toFixed(2)}×</b>
          </div>
        </div>
        {(!ttsOk || english.length === 0) && (
          <p className="tts-notice">
            {ttsOk
              ? '未检测到英语语音包，示范播放可能无声；录音跟读不受影响。'
              : '当前浏览器不支持语音合成，示范播放不可用；录音跟读不受影响。'}
          </p>
        )}
      </div>

      <RecorderCard
        key={phrase.id}
        phrase={phrase}
        voiceURI={voiceURI}
        rate={rate}
        onSave={props.onSaveRecord}
      />

      {records.length > 0 && (
        <div className="recent-history">
          <div className="recent-head">
            <span className="label">本句历史（{records.length}）</span>
            <button type="button" className="ghost" onClick={props.onShowHistory}>
              全部记录 <ChevronRight size={13} />
            </button>
          </div>
          {records.slice(0, 5).map(r => (
            <RecordRow
              key={r.id}
              record={r}
              onPlay={props.onPlayRecord}
              onCompare={props.onCompareRecord}
              onDelete={props.onDeleteRecord}
              onRate={props.onRateRecord}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

interface RecorderCardProps {
  phrase: Phrase;
  voiceURI: string | null;
  rate: number;
  onSave: (take: Take, rating: number) => Promise<void>;
}

function RecorderCard({ phrase, voiceURI, rate, onSave }: RecorderCardProps) {
  const rec = useRecorder();
  const [rating, setRating] = useState(3);
  const [saving, setSaving] = useState(false);
  const now = useSyncExternalStore(subscribePlayback, getNowPlaying);
  const takePlaying = now?.key === 'take';
  const takeComparing = now?.key === 'cmp:take';

  const startRecording = () => {
    stopPlayback();
    void rec.start();
  };

  const save = async () => {
    if (!rec.take || saving) return;
    setSaving(true);
    try {
      stopPlayback();
      await onSave(rec.take, rating);
      rec.discardTake();
      setRating(3);
    } finally {
      setSaving(false);
    }
  };

  const title =
    rec.micState === 'recording'
      ? '正在录音，跟着句子读…'
      : rec.micState === 'ready'
        ? '录音完成，听听效果再保存'
        : '准备好后开始录音';
  const timeLabel = rec.micState === 'idle' ? '00:00.0' : fmtElapsed(rec.elapsed);

  return (
    <div className="record-card">
      <div className="record-top">
        <div>
          <span className="label">YOUR RECORDING</span>
          <h3>{title}</h3>
        </div>
        <span className={rec.micState === 'recording' ? 'record-time live' : 'record-time'}>{timeLabel}</span>
      </div>

      {rec.error && (
        <div className="mic-error" role="alert">
          <AlertTriangle size={16} />
          <p>{rec.error}</p>
          <div className="mic-error-actions">
            <button type="button" onClick={startRecording}>
              重试
            </button>
            <button type="button" onClick={rec.clearError} aria-label="关闭提示">
              ×
            </button>
          </div>
        </div>
      )}

      {rec.micState === 'recording' && (
        <>
          <LiveWaveform analyser={rec.analyser} active />
          <div className="record-actions">
            <button type="button" className="record-button recording" onClick={() => void rec.stop()}>
              <span>
                <Square size={14} />
              </span>
              结束录音
            </button>
            <button type="button" className="secondary" onClick={rec.cancel}>
              取消
            </button>
          </div>
        </>
      )}

      {rec.micState === 'ready' && rec.take && (
        <>
          {rec.take.peaks.length > 0 && <PeaksWaveform peaks={rec.take.peaks} />}
          <div className="record-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => (takePlaying ? stopPlayback() : playRecording('take', rec.take!.blob))}
            >
              {takePlaying ? <Square size={14} /> : <Play size={14} />} 回放
            </button>
            <button
              type="button"
              className="secondary"
              title="先播放示范，再播放你的录音"
              onClick={() =>
                takeComparing
                  ? stopPlayback()
                  : playCompare('cmp:take', phrase.text, rec.take!.blob, { voiceURI, rate })
              }
            >
              <Headphones size={14} />
              {takeComparing ? (now?.stage === 'demo' ? '示范中…' : '录音中…') : '对比回放'}
            </button>
            <button type="button" className="secondary" onClick={startRecording}>
              <RotateCcw size={14} /> 重录
            </button>
          </div>
          <div className="save-row">
            <span>自评</span>
            <Stars value={rating} onChange={setRating} size={18} />
            <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : '保存录音'}
            </button>
            <button type="button" className="ghost" onClick={rec.discardTake}>
              丢弃
            </button>
          </div>
        </>
      )}

      {rec.micState === 'idle' && (
        <>
          <LiveWaveform analyser={null} active={false} />
          <div className="record-actions">
            <button type="button" className="record-button" onClick={startRecording}>
              <span>
                <Mic size={16} />
              </span>
              开始录音
            </button>
            <span className="hint-inline">先听一遍示范，再点击开始跟读</span>
          </div>
        </>
      )}
    </div>
  );
}
