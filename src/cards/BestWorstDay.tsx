import type { CardSet } from '../engine';
import { formatDate, signedInr, tone } from '../app/format';
import { Card } from './Card';
import { useT } from '../app/i18n';

export function BestWorstDay({ card }: { card: CardSet['bestWorstDay'] }) {
  const t = useT();
  return (
    <Card title={t.tBestWorst} result={card}>
      {(d) => (
        <div className="tiles">
          <div className="tile">
            <p className="tile-label">{t.bestDay}</p>
            <p className={`tile-value ${tone(d.best.pnlPaise)}`}>{signedInr(d.best.pnlPaise)}</p>
            <p className="muted">{formatDate(d.best.date, t.months)}</p>
          </div>
          <div className="tile">
            <p className="tile-label">{t.worstDay}</p>
            <p className={`tile-value ${tone(d.worst.pnlPaise)}`}>{signedInr(d.worst.pnlPaise)}</p>
            <p className="muted">{formatDate(d.worst.date, t.months)}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
