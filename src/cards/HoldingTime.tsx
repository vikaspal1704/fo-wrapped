import { formatDuration } from '../engine/format';
import type { CardSet } from '../engine';
import { Card, CompareBars } from './Card';
import { useT } from '../app/i18n';

export function HoldingTime({ card }: { card: CardSet['holdingTime'] }) {
  const t = useT();
  return (
    <Card title={t.tHolding} result={card}>
      {(d) => {
        const ratio = d.medianWinnerMs > 0 ? d.medianLoserMs / d.medianWinnerMs : null;
        return (
          <>
            <p className="lead">{t.medianHeld}</p>
            <CompareBars
              rows={[
                { label: t.winners, value: d.medianWinnerMs, text: formatDuration(d.medianWinnerMs), tone: 'profit' },
                { label: t.losers, value: d.medianLoserMs, text: formatDuration(d.medianLoserMs), tone: 'loss' },
              ]}
            />
            <p className="headline">
              {ratio !== null && ratio >= 1.1
                ? t.holdRatio(ratio.toFixed(1))
                : ratio !== null && ratio <= 0.9
                  ? t.cutLosersFaster
                  : t.holdSame}
            </p>
          </>
        );
      }}
    </Card>
  );
}
