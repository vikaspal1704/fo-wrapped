import { formatInr, formatPct } from '../engine/format';
import type { CardSet } from '../engine';
import { Card, CompareBars } from './Card';

function verdict(winRate: number, avgWin: number, avgLoss: number): string {
  const moreWins = winRate >= 0.5;
  const biggerWins = avgWin >= avgLoss;
  if (moreWins && !biggerWins) return 'Right more often than not, but your losses are bigger than your wins.';
  if (!moreWins && biggerWins) return 'You lose more often, but your wins are bigger than your losses.';
  if (moreWins) return 'More wins, and bigger ones.';
  return 'Fewer wins, and smaller ones.';
}

export function RightButBroke({ card }: { card: CardSet['rightButBroke'] }) {
  return (
    <Card title="Right but broke" result={card}>
      {(d) => (
        <>
          <p className="hero">{formatPct(d.winRate)}</p>
          <p className="lead">
            win rate: {d.wins} wins, {d.losses} losses
          </p>
          <CompareBars
            rows={[
              { label: 'Average win', value: d.avgWinPaise, text: `+${formatInr(d.avgWinPaise)}`, tone: 'profit' },
              { label: 'Average loss', value: d.avgLossPaise, text: `−${formatInr(d.avgLossPaise)}`, tone: 'loss' },
            ]}
          />
          <p className="headline">{verdict(d.winRate, d.avgWinPaise, d.avgLossPaise)}</p>
        </>
      )}
    </Card>
  );
}
