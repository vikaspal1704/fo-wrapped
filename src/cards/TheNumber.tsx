import { formatInr } from '../engine/format';
import type { PeriodView } from '../engine';
import { formatDate, signedInr, tone } from '../app/format';
import { Card } from './Card';

export function TheNumber({ view }: { view: PeriodView }) {
  const { from, to } = view.dateRange;
  return (
    <Card title="The number" result={view.cards.theNumber}>
      {(d) => (
        <>
          <p className="muted">
            {formatDate(from)} – {formatDate(to)}
            {view.title !== 'All trades' && (
              <>
                {' · '}
                <span className="amount">{view.title}</span>
              </>
            )}
          </p>
          <p className={`hero ${tone(d.netPnlPaise)}`}>{signedInr(d.netPnlPaise)}</p>
          <p className="lead">net P&amp;L after all charges</p>
          <dl className="stats">
            <div>
              <dt>Trades</dt>
              <dd>{d.totalTrades}</dd>
            </div>
            <div>
              <dt>Traded value</dt>
              <dd>{formatInr(d.tradedValuePaise)}</dd>
            </div>
          </dl>
        </>
      )}
    </Card>
  );
}
