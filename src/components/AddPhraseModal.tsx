import { useState } from 'react';
import { X } from 'lucide-react';
import type { Level } from '../types';
import { LEVELS } from '../types';

export interface NewPhrase {
  text: string;
  translation: string;
  tag: string;
  level: Level;
}

interface AddPhraseModalProps {
  existingTags: string[];
  onClose: () => void;
  onSubmit: (p: NewPhrase) => void;
}

export function AddPhraseModal({ existingTags, onClose, onSubmit }: AddPhraseModalProps) {
  const [text, setText] = useState('');
  const [translation, setTranslation] = useState('');
  const [tag, setTag] = useState('');
  const [level, setLevel] = useState<Level>('入门');

  const submit = () => {
    if (!text.trim()) return;
    onSubmit({
      text: text.trim(),
      translation: translation.trim(),
      tag: tag.trim() || '自定义',
      level,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>添加练习句子</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        <label>
          英文句子 *
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="例如：I can make this happen."
          />
        </label>
        <label>
          中文释义
          <input
            className="text-input"
            value={translation}
            onChange={e => setTranslation(e.target.value)}
            placeholder="可选"
          />
        </label>
        <div className="modal-grid">
          <label>
            标签
            <input
              className="text-input"
              value={tag}
              onChange={e => setTag(e.target.value)}
              placeholder="如：日常 / 工作"
              list="tag-options"
            />
            <datalist id="tag-options">
              {existingTags.map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label>
            难度
            <select className="text-input" value={level} onChange={e => setLevel(e.target.value as Level)}>
              {LEVELS.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary" onClick={submit} disabled={!text.trim()}>
            加入句子库
          </button>
        </div>
      </div>
    </div>
  );
}
