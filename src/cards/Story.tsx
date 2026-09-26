import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { AnalysisResult, PeriodKind } from '../engine';
import { FileList } from '../app/Landing';
import type { FileStatus } from '../app/useAnalysis';
import { TheNumber } from './TheNumber';
import { WhereMoneyWent } from './WhereMoneyWent';
import { RightButBroke } from './RightButBroke';
import { ExpiryDay } from './ExpiryDay';
import { YourClock } from './YourClock';
import { RevengeTrades } from './RevengeTrades';
import { HoldingTime } from './HoldingTime';
import { BestWorstDay } from './BestWorstDay';
import { Summary } from './Summary';
import { WhatChanged } from './WhatChanged';

interface Props {
  result: AnalysisResult;
  files: FileStatus[];
  onClear: () => void;
}

const SWIPE_PX = 40;

/** Story-style viewer: tap sides, swipe, or use arrow keys. */
const KIND_GROUPS: { kind: PeriodKind; label: string }[] = [
  { kind: 'SAMVAT', label: 'Samvat year' },
  { kind: 'FY', label: 'Financial year' },
  { kind: 'CALENDAR', label: 'Calendar year' },
];

export function Story({ result, files, onClear }: Props) {
  const [viewId, setViewId] = useState(result.defaultViewId);
  const view = result.views.find((v) => v.period.id === viewId) ?? result.views[0]!;
  const { cards } = view;
  const slides: { title: string; node: ReactNode }[] = [
    { title: 'The number', node: <TheNumber view={view} /> },
    { title: 'Where the money went', node: <WhereMoneyWent card={cards.whereMoneyWent} /> },
    { title: 'Right but broke', node: <RightButBroke card={cards.rightButBroke} /> },
    { title: 'Expiry day', node: <ExpiryDay card={cards.expiryDay} /> },
    { title: 'Your clock', node: <YourClock card={cards.yourClock} /> },
    { title: 'Revenge trades', node: <RevengeTrades card={cards.revengeTrades} /> },
    { title: 'Diamond hands, paper hands', node: <HoldingTime card={cards.holdingTime} /> },
    { title: 'Best day, worst day', node: <BestWorstDay card={cards.bestWorstDay} /> },
    ...(view.comparison ? [{ title: 'What changed', node: <WhatChanged comparison={view.comparison} currentLabel={view.period.label} /> }] : []),
    {
      title: 'Your year',
      node: <Summary summary={cards.summary} view={view} versions={{ engine: result.engineVersion, rates: result.rateTableVersion }} onClear={onClear} />,
    },
  ];
  const [index, setIndex] = useState(0);
  const last = slides.length - 1;
  const go = useCallback((delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta))), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX;
    swiped.current = false;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > SWIPE_PX) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
    }
  };
  const tap = (delta: number) => () => {
    if (!swiped.current) go(delta);
  };

  const rejected = files.filter((f) => !f.ok);
  const slide = slides[index]!;

  return (
    <main className="story">
      <div className="story-top">
        <div className="bars" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.title} className={i <= index ? 'on' : ''} />
          ))}
        </div>
        <div className="story-meta">
          <label className="period-picker">
            <span className="sr-only">Period</span>
            <select
              value={view.period.id}
              onChange={(e) => {
                setViewId(e.target.value);
                setIndex(0);
              }}
            >
              <option value="all">All trades</option>
              {KIND_GROUPS.map((g) => {
                const options = result.views.filter((v) => v.period.kind === g.kind && v.roundTripCount > 0);
                return options.length === 0 ? null : (
                  <optgroup key={g.kind} label={g.label}>
                    {options.map((v) => (
                      <option key={v.period.id} value={v.period.id}>
                        {v.period.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <span>
            <span data-testid="slide-count">
              {index + 1} / {slides.length}
            </span>
            {' · '}
            <button type="button" className="link" onClick={onClear}>
              Clear data
            </button>
          </span>
        </div>
      </div>

      <section
        className="card"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${slides.length}: ${slide.title}`}
        aria-live="polite"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {index === 0 && rejected.length > 0 && (
          <div className="alert small">
            {rejected.length === 1 ? 'One file was skipped:' : `${rejected.length} files were skipped:`}
            <FileList files={rejected} />
          </div>
        )}
        {slide.node}
        {index < last && (
          <>
            <button type="button" className="tap-zone prev" aria-label="Previous card" onClick={tap(-1)} disabled={index === 0} />
            <button type="button" className="tap-zone next" aria-label="Next card" onClick={tap(1)} />
          </>
        )}
      </section>

      {index === last && (
        <button type="button" className="link back" onClick={() => go(-1)}>
          ← Back
        </button>
      )}
    </main>
  );
}
