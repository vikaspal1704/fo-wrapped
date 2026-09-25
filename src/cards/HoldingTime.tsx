import { formatDuration } from '../engine/format';
import type { CardSet } from '../engine';
import { Card, CompareBars } from './Card';

export function HoldingTime({ card }: { card: CardSet['holdingTime'] }) {
  return (
    <Card title="Diamond hands, paper hands" result={card}>
      {(d) => {
        const ratio = d.medianWinnerMs > 0 ? d.medianLoserMs / d.medianWinnerMs : null;
        return (
          <>
            <p className="lead">Median time you held…</p>
            <CompareBars
              rows={[
                { label: 'Winners', value: d.medianWinnerMs, text: formatDuration(d.medianWinnerMs), tone: 'profit' },
                { label: 'Losers', value: d.medianLoserMs, text: formatDuration(d.medianLoserMs), tone: 'loss' },
              ]}
            />
            <p className="headline">
              {ratio !== null && ratio >= 1.1
                ? `You hold losers ${ratio.toFixed(1)}× longer than winners.`
                : ratio !== null && ratio <= 0.9
                  ? 'You cut losers faster than you take profits.'
                  : 'You hold winners and losers for about the same time.'}
            </p>
          </>
        );
      }}
    </Card>
  );
}
