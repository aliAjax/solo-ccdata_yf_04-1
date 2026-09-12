import { Star } from 'lucide-react';

const LABELS = ['', '生疏', '磕绊', '一般', '流畅', '地道'];

export function Stars({ value, onChange, size = 15 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className={onChange ? 'stars editable' : 'stars'} title={onChange ? `自评：${LABELS[value] ?? value}` : LABELS[value]}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className="star-btn"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} 星`}
        >
          <Star size={size} fill={n <= value ? '#f0b23e' : 'none'} color={n <= value ? '#f0b23e' : '#ccd6db'} strokeWidth={1.8} />
        </button>
      ))}
    </span>
  );
}
