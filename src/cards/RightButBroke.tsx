import { formatInr, formatPct } from '../engine/format';
import type { CardSet } from '../engine';
import { Card, CompareBars } from './Card';
import { useT, type UiMessages } from '../app/i18n';

function verdict(t: UiMessages, winRate: number, avgWin: number, avgLoss: number): string {
  const moreWins = winRate >= 0.5;
  const biggerWins = avgWin >= avgLoss;
  if (moreWins && !biggerWins) return t.vMoreWinsSmaller;
  if (!moreWins && biggerWins) return t.vFewerWinsBigger;
  if (moreWins) return t.vMoreWinsBigger;
  return t.vFewerWinsSmaller;
}

export function RightButBroke({ card }: { card: CardSet['rightButBroke'] }) {
  const t = useT();
  return (
    <Card title={t.tRightBroke} result={card}>
      {(d) => (
        <>
          <p className="hero">{formatPct(d.winRate)}</p>
          <p className="lead">{t.winRateLine(d.wins, d.losses)}</p>
          <CompareBars
            rows={[
              { label: t.avgWin, value: d.avgWinPaise, text: `+${formatInr(d.avgWinPaise)}`, tone: 'profit' },
              { label: t.avgLoss, value: d.avgLossPaise, text: `−${formatInr(d.avgLossPaise)}`, tone: 'loss' },
            ]}
          />
          <p className="headline">{verdict(t, d.winRate, d.avgWinPaise, d.avgLossPaise)}</p>
        </>
      )}
    </Card>
  );
}
