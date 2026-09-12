export type Level = '入门' | '进阶' | '挑战';

export const LEVELS: Level[] = ['入门', '进阶', '挑战'];

export interface Phrase {
  id: string;
  text: string;
  translation: string;
  tag: string;
  level: Level;
  createdAt: number;
}

export interface PracticeRecord {
  id: string;
  phraseId: string;
  createdAt: number;
  /** seconds */
  duration: number;
  /** self rating 1-5 */
  rating: number;
  mimeType: string;
}

export interface Take {
  blob: Blob;
  url: string;
  /** seconds */
  duration: number;
  /** normalized 0..1 peaks for waveform rendering */
  peaks: number[];
  mimeType: string;
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
