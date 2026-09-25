import { formatInr } from '../engine/format';
import type { CardSet } from '../engine';
import { signedInr } from '../app/format';
import { Card, CompareBars } from './Card';

export function WhereMoneyWent({ card }: { card: CardSet['whereMoneyWent'] }) {
  return (
    <Card title="Where the money went" result={card}>
      {(d) => (
        <>
          <p className="headline">
            {d.chargesPctOfGrossProfit !== null ? (
              <>
                You paid <strong>{formatInr(d.chargesPaise)}</strong> in charges, which is{' '}
                <strong>{Math.round(d.chargesPctOfGrossProfit)}%</strong> of your gross profit.
              </>
            ) : (
              <>
                You paid <strong>{formatInr(d.chargesPaise)}</strong> in charges on top of a gross loss of{' '}
                <strong>{formatInr(-d.grossPnlPaise)}</strong>.
              </>
            )}
          </p>
          <CompareBars
            rows={[
              { label: 'Gross P&L', value: d.grossPnlPaise, text: signedInr(d.grossPnlPaise), tone: d.grossPnlPaise >= 0 ? 'profit' : 'loss' },
              { label: 'Charges', value: d.chargesPaise, text: formatInr(d.chargesPaise), tone: 'neutral' },
            ]}
          />
        </>
      )}
    </Card>
  );
}
