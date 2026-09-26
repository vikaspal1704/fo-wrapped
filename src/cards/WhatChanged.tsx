import { formatDuration, formatInr, formatPct } from '../engine/format';
import type { Comparison, ComparisonRow } from '../engine';
import { useT } from '../app/i18n';

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
  const t = useT();
  return (
    <div className="card-body">
      <h2 className="card-title">{t.tChanged}</h2>
      <div className="card-main">
        <table className="changes">
          <caption className="muted">
            {comparison.previous.label} → {currentLabel}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t.measure}</span>
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
        <li>{t.changedNote1}</li>
        <li>{t.changedNote2}</li>
      </ul>
    </div>
  );
}
