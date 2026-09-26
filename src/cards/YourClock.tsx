import { useState } from 'react';
import type { CardSet, ClockBucket } from '../engine';
import { minuteLabel, signedInr } from '../app/format';
import { Card } from './Card';
import { useT } from '../app/i18n';

const slot = (b: ClockBucket) => `${minuteLabel(b.startMinuteIst)}–${minuteLabel(b.startMinuteIst + 15)}`;

/** Diverging fill: blue for profit, red for loss, grey midpoint; strength by |P&L|. */
function fill(b: ClockBucket, max: number): string {
  if (b.trades === 0 || b.pnlPaise === 0) return 'var(--mid)';
  const pct = Math.round(25 + (75 * Math.abs(b.pnlPaise)) / max);
  return `color-mix(in oklab, var(${b.pnlPaise > 0 ? '--profit' : '--loss'}) ${pct}%, var(--mid))`;
}

export function YourClock({ card }: { card: CardSet['yourClock'] }) {
  const t = useT();
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <Card title={t.tClock} result={card}>
      {(d) => {
        const max = Math.max(...d.buckets.map((b) => Math.abs(b.pnlPaise)), 1);
        const shown = picked ?? d.bestIndex;
        const best = d.bestIndex !== null ? d.buckets[d.bestIndex]! : null;
        const worst = d.worstIndex !== null ? d.buckets[d.worstIndex]! : null;
        return (
          <>
            <ul className="heatmap" aria-label={t.clockAria}>
              {d.buckets.map((b, i) => (
                <li key={b.startMinuteIst}>
                  <button
                    type="button"
                    className={`cell${i === shown ? ' picked' : ''}`}
                    style={{ background: fill(b, max) }}
                    aria-label={t.slotLine(slot(b), b.trades, signedInr(b.pnlPaise))}
                    aria-pressed={i === shown}
                    title={`${slot(b)} · ${b.trades} trades · ${signedInr(b.pnlPaise)}`}
                    onClick={() => setPicked(i)}
                    onMouseEnter={() => setPicked(i)}
                  />
                </li>
              ))}
            </ul>
            <div className="heatmap-marks" aria-hidden="true">
              {d.buckets.map((b, i) => (
                <span key={b.startMinuteIst} className={i === d.bestIndex ? 'profit' : 'loss'}>
                  {i === d.bestIndex ? '▲' : i === d.worstIndex ? '▼' : ''}
                </span>
              ))}
            </div>
            <div className="heatmap-axis" aria-hidden="true">
              <span>09:15</span>
              <span>12:15</span>
              <span>15:30</span>
            </div>
            {shown !== null && (
              <p className="readout">{t.slotLine(slot(d.buckets[shown]!), d.buckets[shown]!.trades, signedInr(d.buckets[shown]!.pnlPaise))}</p>
            )}
            <dl className="stats">
              <div>
                <dt>{t.bestSlot}</dt>
                <dd>
                  {best ? (
                    <>
                      <span>▲ {slot(best)}</span>
                      <span className="profit">{signedInr(best.pnlPaise)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt>{t.worstSlot}</dt>
                <dd>
                  {worst ? (
                    <>
                      <span>▼ {slot(worst)}</span>
                      <span className="loss">{signedInr(worst.pnlPaise)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </>
        );
      }}
    </Card>
  );
}
