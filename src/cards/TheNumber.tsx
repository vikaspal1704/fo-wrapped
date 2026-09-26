import { formatInr } from '../engine/format';
import type { PeriodView } from '../engine';
import { formatDate, signedInr, tone } from '../app/format';
import { Card } from './Card';
import { useT } from '../app/i18n';

export function TheNumber({ view }: { view: PeriodView }) {
  const t = useT();
  const { from, to } = view.dateRange;
  return (
    <Card title={t.tNumber} result={view.cards.theNumber}>
      {(d) => (
        <>
          <p className="muted">
            {formatDate(from, t.months)} – {formatDate(to, t.months)}
            {view.period.kind !== 'ALL' || view.title !== view.period.label ? (
              <>
                {' · '}
                <span className="amount">{view.title}</span>
              </>
            ) : null}
          </p>
          <p className={`hero ${tone(d.netPnlPaise)}`}>{signedInr(d.netPnlPaise)}</p>
          <p className="lead">{t.netAfterCharges}</p>
          <dl className="stats">
            <div>
              <dt>{t.trades}</dt>
              <dd>{d.totalTrades}</dd>
            </div>
            <div>
              <dt>{t.tradedValue}</dt>
              <dd>{formatInr(d.tradedValuePaise)}</dd>
            </div>
          </dl>
        </>
      )}
    </Card>
  );
}
