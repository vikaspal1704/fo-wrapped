import type { CardSet } from '../engine';
import { formatDate, signedInr, tone } from '../app/format';
import { Card } from './Card';

export function BestWorstDay({ card }: { card: CardSet['bestWorstDay'] }) {
  return (
    <Card title="Best day, worst day" result={card}>
      {(d) => (
        <div className="tiles">
          <div className="tile">
            <p className="tile-label">Best day</p>
            <p className={`tile-value ${tone(d.best.pnlPaise)}`}>{signedInr(d.best.pnlPaise)}</p>
            <p className="muted">{formatDate(d.best.date)}</p>
          </div>
          <div className="tile">
            <p className="tile-label">Worst day</p>
            <p className={`tile-value ${tone(d.worst.pnlPaise)}`}>{signedInr(d.worst.pnlPaise)}</p>
            <p className="muted">{formatDate(d.worst.date)}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
