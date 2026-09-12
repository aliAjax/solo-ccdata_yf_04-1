import { useEffect, useMemo, useState } from 'react';
import { History, Mic, Plus, Search, Volume2 } from 'lucide-react';
import type { Phrase, PracticeRecord, Take } from './types';
import { uid } from './types';
import { db } from './db';
import { SEED_PHRASES } from './seed';
import { calcStreak } from './format';
import { backupFilename, buildBackup, buildPhraseExport, download, parseImport, phrasesFilename } from './io';
import { playCompare, playRecording, stopPlayback } from './playback';
import { LibraryPanel } from './components/LibraryPanel';
import { PracticePanel } from './components/PracticePanel';
import { HistoryView } from './components/HistoryView';
import { AddPhraseModal, type NewPhrase } from './components/AddPhraseModal';

const WEEK_GOAL = 20;

export default function App() {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<'practice' | 'history'>('practice');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const [voiceURI, setVoiceURI] = useState<string | null>(() => localStorage.getItem('shadowing.voiceURI'));
  const [rate, setRate] = useState<number>(() => {
    const v = Number(localStorage.getItem('shadowing.rate'));
    return v >= 0.5 && v <= 2 ? v : 1;
  });

  // Initial load from IndexedDB; seed the starter library on first launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let ph = await db.getPhrases();
        if (ph.length === 0 && !localStorage.getItem('shadowing.seeded')) {
          await db.bulkImport(SEED_PHRASES, []);
          localStorage.setItem('shadowing.seeded', '1');
          ph = [...SEED_PHRASES];
        }
        const rec = await db.getRecords();
        if (cancelled) return;
        ph.sort((a, b) => a.createdAt - b.createdAt);
        rec.sort((a, b) => b.createdAt - a.createdAt);
        setPhrases(ph);
        setRecords(rec);
        setSelectedId(ph[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(`本地数据加载失败：${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist voice settings.
  useEffect(() => {
    if (voiceURI) localStorage.setItem('shadowing.voiceURI', voiceURI);
    else localStorage.removeItem('shadowing.voiceURI');
  }, [voiceURI]);
  useEffect(() => {
    localStorage.setItem('shadowing.rate', String(rate));
  }, [rate]);

  // Stop any playback when switching phrases or views.
  useEffect(() => {
    stopPlayback();
  }, [view, selectedId]);

  const phrasesById = useMemo(() => new Map((phrases ?? []).map(p => [p.id, p])), [phrases]);
  const recordsByPhrase = useMemo(() => {
    const map = new Map<string, PracticeRecord[]>();
    for (const r of records) {
      const arr = map.get(r.phraseId);
      if (arr) arr.push(r);
      else map.set(r.phraseId, [r]);
    }
    return map;
  }, [records]);

  const libraryItems = useMemo(
    () =>
      (phrases ?? []).map(p => {
        const rs = recordsByPhrase.get(p.id) ?? [];
        return { ...p, attempts: rs.length, lastAt: rs[0]?.createdAt };
      }),
    [phrases, recordsByPhrase],
  );

  const stats = useMemo(() => {
    const totalSec = records.reduce((s, r) => s + r.duration, 0);
    const week = records.filter(r => r.createdAt >= Date.now() - 7 * 86400_000).length;
    const avg = records.length ? records.reduce((s, r) => s + r.rating, 0) / records.length : 0;
    return { count: records.length, totalSec, week, avg, streak: calcStreak(records.map(r => r.createdAt)) };
  }, [records]);

  const current = phrases?.find(p => p.id === selectedId) ?? null;

  // ---- actions ------------------------------------------------------------

  const addPhrase = (np: NewPhrase) => {
    const p: Phrase = { id: uid(), createdAt: Date.now(), ...np };
    setPhrases(ps => [...(ps ?? []), p]);
    setSelectedId(p.id);
    setShowAdd(false);
    void db.putPhrase(p);
  };

  const deletePhrase = (id: string) => {
    const recIds = (recordsByPhrase.get(id) ?? []).map(r => r.id);
    const remaining = (phrases ?? []).filter(p => p.id !== id);
    setPhrases(remaining);
    setRecords(rs => rs.filter(r => r.phraseId !== id));
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
    void db.deletePhraseCascade(id, recIds);
  };

  const saveRecord = async (phraseId: string, take: Take, rating: number) => {
    const rec: PracticeRecord = {
      id: uid(),
      phraseId,
      createdAt: Date.now(),
      duration: take.duration,
      rating,
      mimeType: take.mimeType,
    };
    await db.putRecord(rec, take.blob);
    setRecords(rs => [rec, ...rs]);
  };

  const deleteRecord = (r: PracticeRecord) => {
    if (!window.confirm('删除这条录音？此操作不可恢复。')) return;
    setRecords(rs => rs.filter(x => x.id !== r.id));
    void db.deleteRecord(r.id);
  };

  const rateRecord = (r: PracticeRecord, rating: number) => {
    const updated = { ...r, rating };
    setRecords(rs => rs.map(x => (x.id === r.id ? updated : x)));
    void db.putRecord(updated);
  };

  const playRecord = async (r: PracticeRecord) => {
    const blob = await db.getAudio(r.id);
    if (blob) playRecording(`rec:${r.id}`, blob);
  };

  const compareRecord = async (r: PracticeRecord) => {
    const blob = await db.getAudio(r.id);
    const phrase = phrasesById.get(r.phraseId);
    if (blob && phrase) playCompare(`cmp:${r.id}`, phrase.text, blob, { voiceURI, rate });
  };

  const importFile = async (file: File) => {
    try {
      const parsed = await parseImport(file);
      const cur = phrases ?? [];
      const ids = new Set(cur.map(p => p.id));
      const texts = new Set(cur.map(p => p.text.trim().toLowerCase()));
      const newPhrases = parsed.phrases.filter(
        p => !ids.has(p.id) && !texts.has(p.text.trim().toLowerCase()),
      );
      const phraseIds = new Set([...ids, ...newPhrases.map(p => p.id)]);
      const recIds = new Set(records.map(r => r.id));
      const newRecords = parsed.records.filter(rw => !recIds.has(rw.record.id) && phraseIds.has(rw.record.phraseId));
      await db.bulkImport(newPhrases, newRecords);
      setPhrases([...cur, ...newPhrases].sort((a, b) => a.createdAt - b.createdAt));
      setRecords(rs => [...newRecords.map(rw => rw.record), ...rs].sort((a, b) => b.createdAt - a.createdAt));
      setDataStatus(`已导入 ${newPhrases.length} 个句子、${newRecords.length} 条录音（重复内容已自动跳过）`);
    } catch (err) {
      setDataStatus(`导入失败：${(err as Error).message}`);
    }
  };

  const exportBackup = async () => {
    if (!phrases) return;
    const blob = await buildBackup(phrases, records, id => db.getAudio(id));
    download(blob, backupFilename());
    setDataStatus(`已导出完整备份：${phrases.length} 个句子、${records.length} 条录音`);
  };

  const exportPhrases = () => {
    if (!phrases) return;
    download(buildPhraseExport(phrases), phrasesFilename());
    setDataStatus(`已导出题库（${phrases.length} 个句子）`);
  };

  const restoreSeeds = () => {
    const cur = phrases ?? [];
    const existing = new Set(cur.map(p => p.id));
    const toAdd = SEED_PHRASES.filter(p => !existing.has(p.id));
    if (toAdd.length === 0) return;
    setPhrases([...cur, ...toAdd].sort((a, b) => a.createdAt - b.createdAt));
    void db.bulkImport(toAdd, []);
    if (!selectedId) setSelectedId(toAdd[0].id);
    setDataStatus(`已恢复 ${toAdd.length} 个示例句子`);
  };

  // ---- render -------------------------------------------------------------

  if (loadError) {
    return (
      <div className="loading-screen">
        <p>{loadError}</p>
        <p className="hint">请确认浏览器允许本站使用 IndexedDB 存储后刷新重试。</p>
      </div>
    );
  }
  if (phrases === null) {
    return <div className="loading-screen">正在加载练习数据…</div>;
  }

  const dateStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Volume2 size={19} />
          </div>
          <div>
            <strong>跟读训练台</strong>
            <span>SHADOWING LAB</span>
          </div>
        </div>
        <div className="side-label">菜单</div>
        <nav>
          <button type="button" className={view === 'practice' ? 'side-link active' : 'side-link'} onClick={() => setView('practice')}>
            <Mic size={17} />
            练习库 <b>{phrases.length}</b>
          </button>
          <button type="button" className={view === 'history' ? 'side-link active' : 'side-link'} onClick={() => setView('history')}>
            <History size={17} />
            练习记录 <b>{records.length}</b>
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="streak">
            <span>连续练习</span>
            <strong>
              {stats.streak} <small>天</small>
            </strong>
            <i>累计 {stats.count} 条录音</i>
          </div>
        </div>
      </aside>

      <main className="main">
        {view === 'practice' ? (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">{dateStr}</p>
                <h1>今天练什么？</h1>
              </div>
              <div className="top-actions">
                <div className="search">
                  <Search size={16} />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索句子" />
                </div>
                <button type="button" className="primary" onClick={() => setShowAdd(true)}>
                  <Plus size={17} />
                  添加句子
                </button>
              </div>
            </header>

            <section className="stats">
              <div>
                <span>本周练习（目标 {WEEK_GOAL} 次）</span>
                <strong>
                  {stats.week} <em>/ {WEEK_GOAL}</em>
                </strong>
                <div className="progress">
                  <i style={{ width: `${Math.min(100, (stats.week / WEEK_GOAL) * 100)}%` }} />
                </div>
              </div>
              <div>
                <span>累计录音</span>
                <strong>
                  {Math.round(stats.totalSec / 60)} <em>分钟</em>
                </strong>
                <small>共 {stats.count} 条录音</small>
              </div>
              <div>
                <span>平均自评</span>
                <strong>
                  {stats.count ? stats.avg.toFixed(1) : '—'} <em>星</em>
                </strong>
                <small className="green">来自每次保存时的自评分</small>
              </div>
            </section>

            <div className="content-grid">
              <LibraryPanel
                items={libraryItems}
                selectedId={selectedId}
                onSelect={setSelectedId}
                query={query}
                importStatus={dataStatus}
                onImportFile={f => void importFile(f)}
                onExportPhrases={exportPhrases}
                onExportBackup={() => void exportBackup()}
                onRestoreSeeds={restoreSeeds}
              />
              {current ? (
                <PracticePanel
                  phrase={current}
                  records={recordsByPhrase.get(current.id) ?? []}
                  voiceURI={voiceURI}
                  rate={rate}
                  onVoiceChange={setVoiceURI}
                  onRateChange={setRate}
                  onSaveRecord={(take, rating) => saveRecord(current.id, take, rating)}
                  onDeletePhrase={() => deletePhrase(current.id)}
                  onPlayRecord={r => void playRecord(r)}
                  onCompareRecord={r => void compareRecord(r)}
                  onDeleteRecord={deleteRecord}
                  onRateRecord={rateRecord}
                  onShowHistory={() => setView('history')}
                />
              ) : (
                <section className="practice">
                  <div className="empty empty-practice">
                    <Mic size={26} />
                    <p>句子库是空的。添加第一句，或从文件导入题库。</p>
                    <button type="button" className="primary" onClick={() => setShowAdd(true)}>
                      <Plus size={16} /> 添加句子
                    </button>
                  </div>
                </section>
              )}
            </div>
          </>
        ) : (
          <HistoryView
            records={records}
            phrasesById={phrasesById}
            onPlayRecord={r => void playRecord(r)}
            onCompareRecord={r => void compareRecord(r)}
            onDeleteRecord={deleteRecord}
            onRateRecord={rateRecord}
            onGoPractice={() => setView('practice')}
          />
        )}
      </main>

      {showAdd && (
        <AddPhraseModal
          existingTags={Array.from(new Set(phrases.map(p => p.tag)))}
          onClose={() => setShowAdd(false)}
          onSubmit={addPhrase}
        />
      )}
    </div>
  );
}
