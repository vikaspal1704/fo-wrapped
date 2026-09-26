import { formatInr, formatPct } from '../engine/format';
import type { CardSet } from '../engine';
import { signedInr, tone } from '../app/format';
import { Card, CompareBars } from './Card';

const bar = (label: string, pnl: number, suffix = '') => ({
  label,
  value: pnl,
  text: `${signedInr(pnl)}${suffix}`,
  tone: pnl >= 0 ? ('profit' as const) : ('loss' as const),
});

export function BuyerVsSeller({ card }: { card: CardSet['buyerVsSeller'] }) {
  return (
    <Card title="Buyer or seller" result={card}>
      {(d) => (
        <>
          <p className="lead">Your option trades, by how they opened</p>
          <CompareBars rows={[bar(`Bought (${d.buyerTrades})`, d.buyerPnlPaise), bar(`Sold (${d.sellerTrades})`, d.sellerPnlPaise)]} />
          <p className="headline">
            {d.buyerPnlPaise === d.sellerPnlPaise
              ? 'Buying and selling options ended level.'
              : d.buyerPnlPaise > d.sellerPnlPaise
                ? 'Buying options did better than selling them.'
                : 'Selling options did better than buying them.'}
          </p>
        </>
      )}
    </Card>
  );
}

export function Underlyings({ card }: { card: CardSet['underlyings'] }) {
  return (
    <Card title="What you traded" result={card}>
      {(d) => (
        <>
          <div className="tiles">
            <div className="tile">
              <p className="tile-label">{d.best.pnlPaise >= 0 ? 'Best underlying' : 'Least bad underlying'}</p>
              <p className="tile-value">{d.best.underlying}</p>
              <p className={tone(d.best.pnlPaise)}>{signedInr(d.best.pnlPaise)}</p>
              <p className="muted">{d.best.trades} trades</p>
            </div>
            <div className="tile">
              <p className="tile-label">{d.worst.pnlPaise < 0 ? 'Worst underlying' : 'Weakest underlying'}</p>
              <p className="tile-value">{d.worst.underlying}</p>
              <p className={tone(d.worst.pnlPaise)}>{signedInr(d.worst.pnlPaise)}</p>
              <p className="muted">{d.worst.trades} trades</p>
            </div>
          </div>
          {d.split && (
            <CompareBars
              rows={[bar(`Index (${d.split.indexTrades})`, d.split.indexPnlPaise), bar(`Stocks (${d.split.stockTrades})`, d.split.stockPnlPaise)]}
            />
          )}
        </>
      )}
    </Card>
  );
}

export function BusyDays({ card }: { card: CardSet['busyDays'] }) {
  return (
    <Card title="Busy days" result={card}>
      {(d) => (
        <>
          <p className="lead">Average P&amp;L per day</p>
          <CompareBars
            rows={[
              bar(`Busy days (${d.busyDays})`, d.busyAvgPnlPaise),
              bar(`Other days (${d.otherDays})`, d.otherAvgPnlPaise),
            ]}
          />
          <p className="headline">
            {d.busyAvgPnlPaise < d.otherAvgPnlPaise
              ? 'Your busiest days were worse on average than your quieter ones.'
              : 'Your busiest days were better on average than your quieter ones.'}
          </p>
        </>
      )}
    </Card>
  );
}

export function Weekday({ card }: { card: CardSet['weekday'] }) {
  return (
    <Card title="Day of the week" result={card}>
      {(d) => (
        <>
          <CompareBars rows={d.days.map((x) => bar(`${x.weekday} (${x.trades})`, x.pnlPaise))} />
          {d.best && d.worst && d.best !== d.worst && (
            <p className="headline">
              Best on <span className="profit">{d.best.weekday}</span>, worst on <span className="loss">{d.worst.weekday}</span>.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function PositionSize({ card }: { card: CardSet['positionSize'] }) {
  return (
    <Card title="Position size" result={card}>
      {(d) => (
        <>
          <p className="lead">Average P&amp;L per trade</p>
          <CompareBars
            rows={[bar(`Bigger (${d.big.trades})`, d.big.avgPnlPaise), bar(`Smaller (${d.small.trades})`, d.small.avgPnlPaise)]}
          />
          <dl className="stats">
            <div>
              <dt>Win rate, bigger</dt>
              <dd>{formatPct(d.big.winRate)}</dd>
            </div>
            <div>
              <dt>Win rate, smaller</dt>
              <dd>{formatPct(d.small.winRate)}</dd>
            </div>
          </dl>
          <p className="muted">Median position: {formatInr(d.medianEntryValuePaise)}</p>
        </>
      )}
    </Card>
  );
}

export function ChargesDrag({ card }: { card: CardSet['chargesDrag'] }) {
  return (
    <Card title="Charges drag" result={card}>
      {(d) => (
        <>
          <p className="hero">{d.winsToCover >= 10 ? Math.round(d.winsToCover) : d.winsToCover.toFixed(1)}</p>
          <p className="lead">
            average winning trades ({formatInr(d.avgWinPaise)} each) went just to pay {formatInr(d.chargesPaise)} in charges.
          </p>
          <p className="headline">That’s {formatInr(d.chargesPerTradePaise)} per trade.</p>
        </>
      )}
    </Card>
  );
}
