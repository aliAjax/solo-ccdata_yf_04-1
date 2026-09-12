import { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Download, FileJson, Mic, RotateCcw, Upload } from 'lucide-react';
import type { Phrase } from '../types';
import { LEVELS } from '../types';
import { fmtTime } from '../format';

export interface LibraryItem extends Phrase {
  attempts: number;
  lastAt?: number;
}

interface LibraryPanelProps {
  items: LibraryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  importStatus: string | null;
  onImportFile: (file: File) => void;
  onExportPhrases: () => void;
  onExportBackup: () => void;
  onRestoreSeeds: () => void;
}

const ALL = '全部';

export function LibraryPanel({
  items,
  selectedId,
  onSelect,
  query,
  importStatus,
  onImportFile,
  onExportPhrases,
  onExportBackup,
  onRestoreSeeds,
}: LibraryPanelProps) {
  const [tagFilter, setTagFilter] = useState(ALL);
  const [levelFilter, setLevelFilter] = useState(ALL);
  const fileRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => [ALL, ...Array.from(new Set(items.map(p => p.tag)))], [items]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      p =>
        (tagFilter === ALL || p.tag === tagFilter) &&
        (levelFilter === ALL || p.level === levelFilter) &&
        (!q || p.text.toLowerCase().includes(q) || p.translation.toLowerCase().includes(q)),
    );
  }, [items, tagFilter, levelFilter, query]);

  return (
    <section className="library">
      <div className="section-head">
        <div>
          <h2>句子库</h2>
          <p>选择一句开始跟读训练</p>
        </div>
        <div className="head-actions">
          <button type="button" className="icon-btn" title="导入题库或完整备份（.json / .txt）" onClick={() => fileRef.current?.click()}>
            <Upload size={16} />
          </button>
          <button type="button" className="icon-btn" title="导出题库（不含录音）" onClick={onExportPhrases}>
            <FileJson size={16} />
          </button>
          <button type="button" className="icon-btn" title="导出完整备份（题库 + 全部录音）" onClick={onExportBackup}>
            <Download size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {importStatus && <p className="import-status">{importStatus}</p>}

      {items.length === 0 ? (
        <div className="empty">
          <p>句子库是空的。添加第一句，或导入题库文件。</p>
          <button type="button" className="secondary" onClick={onRestoreSeeds}>
            <RotateCcw size={14} /> 恢复示例句子
          </button>
        </div>
      ) : (
        <>
          <div className="filter-row">
            <span>标签</span>
            <div className="filters">
              {tags.map(t => (
                <button key={t} type="button" className={tagFilter === t ? 'chip active' : 'chip'} onClick={() => setTagFilter(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-row">
            <span>难度</span>
            <div className="filters">
              {[ALL, ...LEVELS].map(l => (
                <button key={l} type="button" className={levelFilter === l ? 'chip active' : 'chip'} onClick={() => setLevelFilter(l)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="phrase-list">
            {filtered.map(p => (
              <button key={p.id} type="button" onClick={() => onSelect(p.id)} className={p.id === selectedId ? 'phrase selected' : 'phrase'}>
                <div className="phrase-icon">{p.attempts > 0 ? <Check size={15} /> : <Mic size={15} />}</div>
                <div className="phrase-copy">
                  <strong>{p.text}</strong>
                  <span>{p.translation || ' '}</span>
                  <div className="phrase-meta">
                    <i>{p.tag}</i>
                    <i>{p.level}</i>
                    {p.attempts > 0 && (
                      <small>
                        {p.attempts} 次练习{p.lastAt ? ` · ${fmtTime(p.lastAt)}` : ''}
                      </small>
                    )}
                  </div>
                </div>
                <ChevronRight size={17} />
              </button>
            ))}
            {filtered.length === 0 && <div className="empty">没有匹配的句子，换个筛选条件试试。</div>}
          </div>
        </>
      )}
    </section>
  );
}
