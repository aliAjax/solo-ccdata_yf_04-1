import type { Level, Phrase, PracticeRecord } from './types';
import { LEVELS, uid } from './types';
import type { RecordWithAudio } from './db';

const APP_MARK = 'shadowing-lab';

interface BackupRecord extends PracticeRecord {
  /** base64 data URL of the audio blob */
  audio?: string;
}

interface BackupFile {
  app: string;
  version: 1;
  kind: 'backup' | 'phrases';
  exportedAt: number;
  phrases: Phrase[];
  records?: BackupRecord[];
}

export interface ParsedImport {
  phrases: Phrase[];
  records: RecordWithAudio[];
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('读取音频失败'));
    reader.readAsDataURL(blob);
  });
}

async function dataURLToBlob(dataURL: string): Promise<Blob> {
  const res = await fetch(dataURL);
  return res.blob();
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Full backup: phrases + records + audio (base64). */
export async function buildBackup(
  phrases: Phrase[],
  records: PracticeRecord[],
  getAudio: (id: string) => Promise<Blob | undefined>,
): Promise<Blob> {
  const out: BackupRecord[] = [];
  for (const r of records) {
    const audio = await getAudio(r.id);
    out.push(audio ? { ...r, audio: await blobToDataURL(audio) } : { ...r });
  }
  const file: BackupFile = {
    app: APP_MARK,
    version: 1,
    kind: 'backup',
    exportedAt: Date.now(),
    phrases,
    records: out,
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

/** Phrase-library-only export (no audio, easy to share/edit). */
export function buildPhraseExport(phrases: Phrase[]): Blob {
  const file: BackupFile = {
    app: APP_MARK,
    version: 1,
    kind: 'phrases',
    exportedAt: Date.now(),
    phrases,
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

export function backupFilename(): string {
  return `shadowing-backup-${stamp()}.json`;
}

export function phrasesFilename(): string {
  return `shadowing-phrases-${stamp()}.json`;
}

function asLevel(v: unknown): Level {
  return LEVELS.includes(v as Level) ? (v as Level) : '入门';
}

function asPhrase(v: unknown): Phrase | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.text !== 'string' || !o.text.trim()) return null;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : uid(),
    text: o.text.trim(),
    translation: typeof o.translation === 'string' ? o.translation.trim() : '',
    tag: typeof o.tag === 'string' && o.tag.trim() ? o.tag.trim() : '自定义',
    level: asLevel(o.level),
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
  };
}

function asRecord(v: unknown): { record: PracticeRecord; audioURL?: string } | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.phraseId !== 'string' || !o.phraseId) return null;
  const rating = typeof o.rating === 'number' ? Math.min(5, Math.max(1, Math.round(o.rating))) : 3;
  return {
    record: {
      id: typeof o.id === 'string' && o.id ? o.id : uid(),
      phraseId: o.phraseId,
      createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
      duration: typeof o.duration === 'number' && o.duration >= 0 ? o.duration : 0,
      rating,
      mimeType: typeof o.mimeType === 'string' ? o.mimeType : 'audio/webm',
    },
    audioURL: typeof o.audio === 'string' && o.audio.startsWith('data:') ? o.audio : undefined,
  };
}

/**
 * Parse an import file. Accepts:
 *  - full backup JSON ({ phrases, records })
 *  - phrase-only JSON ({ phrases } or a bare array)
 *  - plain text, one phrase per line: "英文 | 中文 | 标签 | 难度"
 */
export async function parseImport(file: File): Promise<ParsedImport> {
  const text = await file.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error('文件是空的');

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error('JSON 格式不正确，无法解析');
    }
    const container = Array.isArray(data) ? { phrases: data } : (data as Record<string, unknown>);
    const rawPhrases = Array.isArray(container.phrases) ? container.phrases : [];
    const phrases = rawPhrases.map(asPhrase).filter((p): p is Phrase => p !== null);
    const rawRecords = Array.isArray(container.records) ? container.records : [];
    const records: RecordWithAudio[] = [];
    for (const raw of rawRecords) {
      const parsed = asRecord(raw);
      if (!parsed) continue;
      let audio: Blob | null = null;
      if (parsed.audioURL) {
        try {
          audio = await dataURLToBlob(parsed.audioURL);
        } catch {
          audio = null; // keep the record even if its audio is corrupt
        }
      }
      records.push({ record: parsed.record, audio });
    }
    if (phrases.length === 0 && records.length === 0) {
      throw new Error('文件里没有可导入的句子或记录');
    }
    return { phrases, records };
  }

  // Plain text: one phrase per line, "|" separated fields.
  const phrases = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [en, zh, tag, level] = line.split('|').map(s => (s ?? '').trim());
      return asPhrase({ text: en, translation: zh ?? '', tag: tag ?? '', level: level ?? '' });
    })
    .filter((p): p is Phrase => p !== null);
  if (phrases.length === 0) throw new Error('没有识别到有效句子，格式：英文 | 中文 | 标签 | 难度');
  return { phrases, records: [] };
}
