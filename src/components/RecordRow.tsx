import { useSyncExternalStore } from 'react';
import { Headphones, Play, Square, Trash2 } from 'lucide-react';
import type { PracticeRecord } from '../types';
import { fmtDuration, fmtTime } from '../format';
import { getNowPlaying, stopPlayback, subscribePlayback } from '../playback';
import { Stars } from './Stars';

interface RecordRowProps {
  record: PracticeRecord;
  onPlay: (r: PracticeRecord) => void;
  onCompare: (r: PracticeRecord) => void;
  onDelete: (r: PracticeRecord) => void;
  onRate: (r: PracticeRecord, rating: number) => void;
}

/** One saved recording: time, duration, self-rating, play / compare-play / delete. */
export function RecordRow({ record, onPlay, onCompare, onDelete, onRate }: RecordRowProps) {
  const now = useSyncExternalStore(subscribePlayback, getNowPlaying);
  const isPlaying = now?.key === `rec:${record.id}`;
  const isComparing = now?.key === `cmp:${record.id}`;
  const active = isPlaying || isComparing;

  return (
    <div className={active ? 'record-row playing' : 'record-row'}>
      <button
        type="button"
        className="mini-play"
        title={isPlaying ? '停止' : '回放录音'}
        onClick={() => (isPlaying ? stopPlayback() : onPlay(record))}
      >
        {isPlaying ? <Square size={13} /> : <Play size={13} />}
      </button>
      <div className="record-meta">
        <strong>{fmtTime(record.createdAt)}</strong>
        <span>
          时长 {fmtDuration(record.duration)}
          {isComparing && <em className="stage">{now?.stage === 'demo' ? ' · 示范播放中…' : ' · 录音播放中…'}</em>}
        </span>
      </div>
      <Stars value={record.rating} onChange={v => onRate(record, v)} />
      <button
        type="button"
        className={isComparing ? 'row-action active' : 'row-action'}
        title="依次回放：示范 → 录音"
        onClick={() => (isComparing ? stopPlayback() : onCompare(record))}
      >
        <Headphones size={14} />
        对比
      </button>
      <button type="button" className="row-action danger" title="删除这条录音" onClick={() => onDelete(record)}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
