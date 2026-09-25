import { formatInr } from '../engine/format';
import type { AnalysisResult } from '../engine';
import { formatDate, signedInr, tone } from '../app/format';
import { Card } from './Card';

export function TheNumber({ result }: { result: AnalysisResult }) {
  const { from, to } = result.dateRange;
  return (
    <Card title="The number" result={result.cards.theNumber}>
      {(d) => (
        <>
          <p className="muted">
            {formatDate(from)} – {formatDate(to)}
            {result.samvat && ` · Samvat ${result.samvat}`}
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
