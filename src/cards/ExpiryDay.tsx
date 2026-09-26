import type { CardSet } from '../engine';
import { signedInr, tone } from '../app/format';
import { Card } from './Card';
import { useT, type UiMessages } from '../app/i18n';

function verdict(t: UiMessages, expiry: number, other: number): string {
  if (expiry < 0 && other >= 0) return t.eLostOtherMade;
  if (expiry >= 0 && other < 0) return t.eMadeOtherLost;
  if (expiry < 0) return t.eBothLost;
  return t.eBothMade;
}

export function ExpiryDay({ card }: { card: CardSet['expiryDay'] }) {
  const t = useT();
  return (
    <Card title={t.tExpiry} result={card}>
      {(d) => (
        <>
          <div className="tiles">
            <div className="tile">
              <p className="tile-label">{t.onExpiryDays}</p>
              <p className={`tile-value ${tone(d.expiryPnlPaise)}`}>{signedInr(d.expiryPnlPaise)}</p>
              <p className="muted">{t.nTrades(d.expiryTrades)}</p>
            </div>
            <div className="tile">
              <p className="tile-label">{t.otherDays}</p>
              <p className={`tile-value ${tone(d.otherPnlPaise)}`}>{signedInr(d.otherPnlPaise)}</p>
              <p className="muted">{t.nTrades(d.otherTrades)}</p>
            </div>
          </div>
          <p className="headline">{verdict(t, d.expiryPnlPaise, d.otherPnlPaise)}</p>
        </>
      )}
    </Card>
  );
}
