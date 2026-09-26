import { formatDuration, formatInr, formatPct } from '../engine/format';
import type { Comparison, ComparisonRow } from '../engine';

function show(row: ComparisonRow, v: number | null): string {
  if (v === null) return '—';
  switch (row.unit) {
    case 'paise':
      return formatInr(v);
    case 'ratio':
      return formatPct(v);
    case 'ms':
      return formatDuration(v);
    case 'count':
      return String(v);
  }
}

/** Year-over-year facts (ROADMAP X5): both numbers side by side, no verdicts. */
export function WhatChanged({ comparison, currentLabel }: { comparison: Comparison; currentLabel: string }) {
  return (
    <div className="card-body">
      <h2 className="card-title">What changed</h2>
      <div className="card-main">
        <table className="changes">
          <caption className="muted">
            {comparison.previous.label} → {currentLabel}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col">{comparison.previous.label}</th>
              <th scope="col">{currentLabel}</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{show(row, row.previous)}</td>
                <td className="now">{show(row, row.current)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="notes">
        <li>P&amp;L is before charges where charges can’t be estimated for either period.</li>
        <li>“—” means that period didn’t have enough trades for the number.</li>
      </ul>
    </div>
  );
}
