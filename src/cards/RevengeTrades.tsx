import type { CardSet } from '../engine';
import { signedInr, tone } from '../app/format';
import { Card } from './Card';
import { useT } from '../app/i18n';

export function RevengeTrades({ card }: { card: CardSet['revengeTrades'] }) {
  const t = useT();
  return (
    <Card title={t.tRevenge} result={card}>
      {(d) =>
        d.count === 0 ? (
          <>
            <p className="hero">0</p>
            <p className="lead">{t.noRevenge}</p>
          </>
        ) : (
          <>
            <p className="hero">{d.count}</p>
            <p className="lead">{t.revengeLine(d.triggers)}</p>
            <p className="headline">
              {t.togetherMade} <span className={tone(d.combinedPnlPaise)}>{signedInr(d.combinedPnlPaise)}</span>.
            </p>
          </>
        )
      }
    </Card>
  );
}
