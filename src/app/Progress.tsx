import type { Stage } from '../worker/protocol';
import { useT, type UiMessages } from './i18n';

const LABELS: Record<Stage, keyof UiMessages> = {
  reading: 'stageReading',
  validating: 'stageValidating',
  matching: 'stageMatching',
  cards: 'stageCards',
};

export function Progress({ stage, pct }: { stage: Stage; pct: number }) {
  const t = useT();
  return (
    <main className="progress-screen" aria-busy="true">
      <p>{t[LABELS[stage]] as string}</p>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="privacy">{t.onDevice}</p>
    </main>
  );
}
