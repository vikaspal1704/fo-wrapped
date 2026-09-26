import { formatInr } from '../engine/format';
import type { CardSet } from '../engine';
import { signedInr } from '../app/format';
import { Card, CompareBars } from './Card';
import { useT } from '../app/i18n';

export function WhereMoneyWent({ card }: { card: CardSet['whereMoneyWent'] }) {
  const t = useT();
  return (
    <Card title={t.tMoney} result={card}>
      {(d) => (
        <>
          <p className="headline">
            {d.chargesPctOfGrossProfit !== null
              ? t.paidPct(formatInr(d.chargesPaise), Math.round(d.chargesPctOfGrossProfit))
              : t.paidOnLoss(formatInr(d.chargesPaise), formatInr(-d.grossPnlPaise))}
          </p>
          <CompareBars
            rows={[
              { label: t.grossPnl, value: d.grossPnlPaise, text: signedInr(d.grossPnlPaise), tone: d.grossPnlPaise >= 0 ? 'profit' : 'loss' },
              { label: t.charges, value: d.chargesPaise, text: formatInr(d.chargesPaise), tone: 'neutral' },
            ]}
          />
        </>
      )}
    </Card>
  );
}
