import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { AnalysisResult } from '../engine';
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

interface Props {
  result: AnalysisResult;
  files: FileStatus[];
  onClear: () => void;
}

const SWIPE_PX = 40;

/** Story-style viewer: tap sides, swipe, or use arrow keys. */
export function Story({ result, files, onClear }: Props) {
  const { cards } = result;
  const slides: { title: string; node: ReactNode }[] = [
    { title: 'The number', node: <TheNumber result={result} /> },
    { title: 'Where the money went', node: <WhereMoneyWent card={cards.whereMoneyWent} /> },
    { title: 'Right but broke', node: <RightButBroke card={cards.rightButBroke} /> },
    { title: 'Expiry day', node: <ExpiryDay card={cards.expiryDay} /> },
    { title: 'Your clock', node: <YourClock card={cards.yourClock} /> },
    { title: 'Revenge trades', node: <RevengeTrades card={cards.revengeTrades} /> },
    { title: 'Diamond hands, paper hands', node: <HoldingTime card={cards.holdingTime} /> },
    { title: 'Best day, worst day', node: <BestWorstDay card={cards.bestWorstDay} /> },
    { title: 'Your year', node: <Summary summary={cards.summary} result={result} onClear={onClear} /> },
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
          <span>
            {index + 1} / {slides.length}
          </span>
          <button type="button" className="link" onClick={onClear}>
            Clear data
          </button>
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
