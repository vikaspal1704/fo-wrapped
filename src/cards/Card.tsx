import type { ReactNode } from 'react';
import type { CardResult } from '../engine';

interface Props<T> {
  title: string;
  result: CardResult<T>;
  children: (data: T) => ReactNode;
}

/** Frame for one card: title, body (or the reason there isn't one), notes. */
export function Card<T>({ title, result, children }: Props<T>) {
  return (
    <div className="card-body">
      <h2 className="card-title">{title}</h2>
      {result.status === 'OK' ? (
        <>
          <div className="card-main">{children(result.data)}</div>
          {result.notes.length > 0 && (
            <ul className="notes">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="card-main insufficient">
          <p className="big-muted">Not enough trades to say.</p>
          <p className="muted">{result.reason}</p>
        </div>
      )}
    </div>
  );
}

/** Two values on one scale, as thin bars with their values beside them. */
export function CompareBars({ rows }: { rows: { label: string; value: number; text: string; tone: 'profit' | 'loss' | 'neutral' }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="compare">
      {rows.map((r) => (
        <div className="compare-row" key={r.label}>
          <span className="compare-label">{r.label}</span>
          <span className="compare-track">
            <span className={`compare-bar ${r.tone}`} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
          </span>
          <span className="compare-value">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
