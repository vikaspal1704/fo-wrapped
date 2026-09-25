import type { CardSet } from '../engine';
import { signedInr, tone } from '../app/format';
import { Card } from './Card';

function verdict(expiry: number, other: number): string {
  if (expiry < 0 && other >= 0) return 'Expiry days lost money while the other days made it.';
  if (expiry >= 0 && other < 0) return 'Expiry days made money while the other days lost it.';
  if (expiry < 0) return 'You lost money on expiry days and on the other days.';
  return 'You made money on expiry days and on the other days.';
}

export function ExpiryDay({ card }: { card: CardSet['expiryDay'] }) {
  return (
    <Card title="Expiry day" result={card}>
      {(d) => (
        <>
          <div className="tiles">
            <div className="tile">
              <p className="tile-label">On expiry days</p>
              <p className={`tile-value ${tone(d.expiryPnlPaise)}`}>{signedInr(d.expiryPnlPaise)}</p>
              <p className="muted">{d.expiryTrades} trades</p>
            </div>
            <div className="tile">
              <p className="tile-label">All other days</p>
              <p className={`tile-value ${tone(d.otherPnlPaise)}`}>{signedInr(d.otherPnlPaise)}</p>
              <p className="muted">{d.otherTrades} trades</p>
            </div>
          </div>
          <p className="headline">{verdict(d.expiryPnlPaise, d.otherPnlPaise)}</p>
        </>
      )}
    </Card>
  );
}
