import type { CardSet } from '../engine';
import { signedInr, tone } from '../app/format';
import { Card } from './Card';

export function RevengeTrades({ card }: { card: CardSet['revengeTrades'] }) {
  return (
    <Card title="Revenge trades" result={card}>
      {(d) =>
        d.count === 0 ? (
          <>
            <p className="hero">0</p>
            <p className="lead">revenge trades. After your big losses, you waited more than 15 minutes every time.</p>
          </>
        ) : (
          <>
            <p className="hero">{d.count}</p>
            <p className="lead">
              trades entered within 15 minutes of a big loss ({d.triggers} big loss{d.triggers === 1 ? '' : 'es'})
            </p>
            <p className="headline">
              Together they made <span className={tone(d.combinedPnlPaise)}>{signedInr(d.combinedPnlPaise)}</span>.
            </p>
          </>
        )
      }
    </Card>
  );
}
