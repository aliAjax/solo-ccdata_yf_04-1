import { useMemo } from 'react';
import { Mic } from 'lucide-react';
import type { Phrase, PracticeRecord } from '../types';
import { RecordRow } from './RecordRow';

interface HistoryViewProps {
  records: PracticeRecord[];
  phrasesById: Map<string, Phrase>;
  onPlayRecord: (r: PracticeRecord) => void;
  onCompareRecord: (r: PracticeRecord) => void;
  onDeleteRecord: (r: PracticeRecord) => void;
  onRateRecord: (r: PracticeRecord, rating: number) => void;
  onGoPractice: () => void;
}

/** All recordings, grouped per phrase, newest first. */
export function HistoryView({
  records,
  phrasesById,
  onPlayRecord,
  onCompareRecord,
  onDeleteRecord,
  onRateRecord,
  onGoPractice,
}: HistoryViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, PracticeRecord[]>();
    for (const r of records) {
      const arr = map.get(r.phraseId);
      if (arr) arr.push(r);
      else map.set(r.phraseId, [r]);
    }
    return Array.from(map.entries())
      .map(([phraseId, rs]) => ({ phrase: phrasesById.get(phraseId), records: rs }))
      .filter((g): g is { phrase: Phrase; records: PracticeRecord[] } => Boolean(g.phrase))
      .sort((a, b) => b.records[0].createdAt - a.records[0].createdAt);
  }, [records, phrasesById]);

  const totalSec = records.reduce((s, r) => s + r.duration, 0);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">PRACTICE HISTORY</p>
          <h1>练习记录</h1>
        </div>
        {records.length > 0 && (
          <p className="history-summary">
            共 {records.length} 条录音 · 累计{' '}
            {totalSec >= 60 ? `${Math.floor(totalSec / 60)} 分 ${Math.round(totalSec % 60)} 秒` : `${Math.round(totalSec)} 秒`}
          </p>
        )}
      </header>

      {records.length === 0 ? (
        <div className="empty history-empty">
          <Mic size={26} />
          <p>还没有练习记录。回到练习库，录下第一段跟读吧。</p>
          <button type="button" className="primary" onClick={onGoPractice}>
            去练习
          </button>
        </div>
      ) : (
        <div className="history-list">
          {groups.map(g => (
            <section className="history-group" key={g.phrase.id}>
              <div className="history-phrase">
                <div className="history-phrase-copy">
                  <strong>{g.phrase.text}</strong>
                  {g.phrase.translation && <span>{g.phrase.translation}</span>}
                </div>
                <div className="phrase-meta">
                  <i>{g.phrase.tag}</i>
                  <i>{g.phrase.level}</i>
                  <small>{g.records.length} 条录音</small>
                </div>
              </div>
              {g.records.map(r => (
                <RecordRow
                  key={r.id}
                  record={r}
                  onPlay={onPlayRecord}
                  onCompare={onCompareRecord}
                  onDelete={onDeleteRecord}
                  onRate={onRateRecord}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
