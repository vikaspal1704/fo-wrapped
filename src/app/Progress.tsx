import type { Stage } from '../worker/protocol';

const LABELS: Record<Stage, string> = {
  reading: 'Reading your files…',
  validating: 'Checking every row…',
  matching: 'Matching trades and estimating charges…',
  cards: 'Building your cards…',
};

export function Progress({ stage, pct }: { stage: Stage; pct: number }) {
  return (
    <main className="progress-screen" aria-busy="true">
      <p>{LABELS[stage]}</p>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="privacy">Everything is happening on this device.</p>
    </main>
  );
}
