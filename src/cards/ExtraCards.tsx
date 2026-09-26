import { formatInr, formatPct } from '../engine/format';
import type { CardSet } from '../engine';
import { signedInr, tone } from '../app/format';
import { Card, CompareBars } from './Card';
import { useT } from '../app/i18n';

const bar = (label: string, pnl: number, suffix = '') => ({
  label,
  value: pnl,
  text: `${signedInr(pnl)}${suffix}`,
  tone: pnl >= 0 ? ('profit' as const) : ('loss' as const),
});

export function BuyerVsSeller({ card }: { card: CardSet['buyerVsSeller'] }) {
  const t = useT();
  return (
    <Card title={t.tBuyerSeller} result={card}>
      {(d) => (
        <>
          <p className="lead">{t.byHowOpened}</p>
          <CompareBars rows={[bar(t.bought(d.buyerTrades), d.buyerPnlPaise), bar(t.sold(d.sellerTrades), d.sellerPnlPaise)]} />
          <p className="headline">
            {d.buyerPnlPaise === d.sellerPnlPaise
              ? t.bsLevel
              : d.buyerPnlPaise > d.sellerPnlPaise
                ? t.bsBuyBetter
                : t.bsSellBetter}
          </p>
        </>
      )}
    </Card>
  );
}

export function Underlyings({ card }: { card: CardSet['underlyings'] }) {
  const t = useT();
  return (
    <Card title={t.tUnderlyings} result={card}>
      {(d) => (
        <>
          <div className="tiles">
            <div className="tile">
              <p className="tile-label">{d.best.pnlPaise >= 0 ? t.bestUnderlying : t.leastBadUnderlying}</p>
              <p className="tile-value">{d.best.underlying}</p>
              <p className={tone(d.best.pnlPaise)}>{signedInr(d.best.pnlPaise)}</p>
              <p className="muted">{t.nTrades(d.best.trades)}</p>
            </div>
            <div className="tile">
              <p className="tile-label">{d.worst.pnlPaise < 0 ? t.worstUnderlying : t.weakestUnderlying}</p>
              <p className="tile-value">{d.worst.underlying}</p>
              <p className={tone(d.worst.pnlPaise)}>{signedInr(d.worst.pnlPaise)}</p>
              <p className="muted">{t.nTrades(d.worst.trades)}</p>
            </div>
          </div>
          {d.split && (
            <CompareBars
              rows={[bar(t.indexN(d.split.indexTrades), d.split.indexPnlPaise), bar(t.stocksN(d.split.stockTrades), d.split.stockPnlPaise)]}
            />
          )}
        </>
      )}
    </Card>
  );
}

export function BusyDays({ card }: { card: CardSet['busyDays'] }) {
  const t = useT();
  return (
    <Card title={t.tBusy} result={card}>
      {(d) => (
        <>
          <p className="lead">{t.avgPerDay}</p>
          <CompareBars
            rows={[
              bar(t.busyN(d.busyDays), d.busyAvgPnlPaise),
              bar(t.otherN(d.otherDays), d.otherAvgPnlPaise),
            ]}
          />
          <p className="headline">
            {d.busyAvgPnlPaise < d.otherAvgPnlPaise
              ? t.busyWorse
              : t.busyBetter}
          </p>
        </>
      )}
    </Card>
  );
}

export function Weekday({ card }: { card: CardSet['weekday'] }) {
  const t = useT();
  const name = (w: string) => t.weekdayNames[w] ?? w;
  return (
    <Card title={t.tWeekday} result={card}>
      {(d) => (
        <>
          <CompareBars rows={d.days.map((x) => bar(`${name(x.weekday)} (${x.trades})`, x.pnlPaise))} />
          {d.best && d.worst && d.best !== d.worst && (
            <p className="headline">
              {t.bestWorstWeekday(<span className="profit">{name(d.best.weekday)}</span>, <span className="loss">{name(d.worst.weekday)}</span>)}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function PositionSize({ card }: { card: CardSet['positionSize'] }) {
  const t = useT();
  return (
    <Card title={t.tSize} result={card}>
      {(d) => (
        <>
          <p className="lead">{t.avgPerTrade}</p>
          <CompareBars
            rows={[bar(t.biggerN(d.big.trades), d.big.avgPnlPaise), bar(t.smallerN(d.small.trades), d.small.avgPnlPaise)]}
          />
          <dl className="stats">
            <div>
              <dt>{t.winRateBigger}</dt>
              <dd>{formatPct(d.big.winRate)}</dd>
            </div>
            <div>
              <dt>{t.winRateSmaller}</dt>
              <dd>{formatPct(d.small.winRate)}</dd>
            </div>
          </dl>
          <p className="muted">{t.medianPosition(formatInr(d.medianEntryValuePaise))}</p>
        </>
      )}
    </Card>
  );
}

export function ChargesDrag({ card }: { card: CardSet['chargesDrag'] }) {
  const t = useT();
  return (
    <Card title={t.tDrag} result={card}>
      {(d) => (
        <>
          <p className="hero">{d.winsToCover >= 10 ? Math.round(d.winsToCover) : d.winsToCover.toFixed(1)}</p>
          <p className="lead">{t.dragLine(formatInr(d.avgWinPaise), formatInr(d.chargesPaise))}</p>
          <p className="headline">{t.perTrade(formatInr(d.chargesPerTradePaise))}</p>
        </>
      )}
    </Card>
  );
}
